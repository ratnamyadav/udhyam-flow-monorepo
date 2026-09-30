import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { expireStaleHolds, markBookingPaid, markPaymentFailed, recordRefundTotal } from '../src';
import {
  addMember,
  addService,
  createTestDb,
  type Fixture,
  publicCaller,
  seedOrg,
  slotOn,
  uid,
  userCaller,
} from './helpers/harness';

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

beforeAll(async () => {
  // A configured gateway makes paid bookings go through checkout. No
  // network calls happen in these tests — every path under test is decided
  // before the gateway is contacted.
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  db = await createTestDb();
});

async function paidBooking(f: Fixture, daysAhead: number, hhmm: string, serviceId?: string) {
  const svc = serviceId ?? (await addService(db, f.orgId, { priceCents: 2_500, currency: 'USD' }));
  const { start, date } = slotOn(f, daysAhead, hhmm);
  const res = await publicCaller(db).booking.create({
    orgSlug: f.slug,
    resourceId: f.resourceId,
    locationId: f.locationId,
    serviceId: svc,
    customerName: 'Sam Lee',
    slotStart: start.toISOString(),
  });
  return { ...res, serviceId: svc, start, date };
}

const load = async (id: string) =>
  (await db.select().from(schema.booking).where(eq(schema.booking.id, id)))[0]!;

describe('paid bookings', () => {
  it('hold the slot pending payment instead of confirming for free', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await paidBooking(f, 1, '10:00');
    expect(b).toMatchObject({
      status: 'pending_payment',
      requiresPayment: true,
      amountCents: 2_500,
      currency: 'USD',
    });
    expect(b.holdExpiresAt).toBeInstanceOf(Date);
    await expect(paidBooking(f, 1, '10:00', b.serviceId)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('release the slot when the hold lapses', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await paidBooking(f, 1, '11:00');
    await db
      .update(schema.booking)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.booking.id, b.id));
    const again = await paidBooking(f, 1, '11:00', b.serviceId);
    expect(again.status).toBe('pending_payment');
    expect((await load(b.id)).status).toBe('expired');
  });

  it('checkout refuses anything not awaiting payment', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await paidBooking(f, 1, '12:00');
    await db
      .update(schema.booking)
      .set({ paymentStatus: 'paid' })
      .where(eq(schema.booking.id, b.id));
    await expect(
      publicCaller(db).payment.createCheckout({ bookingId: b.id }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'This booking is already paid.',
    });

    const free = await addService(db, f.orgId, { priceCents: 0 });
    const { start } = slotOn(f, 1, '14:00');
    const confirmed = await publicCaller(db).booking.create({
      orgSlug: f.slug,
      resourceId: f.resourceId,
      locationId: f.locationId,
      serviceId: free,
      customerName: 'Free Person',
      slotStart: start.toISOString(),
    });
    await expect(
      publicCaller(db).payment.createCheckout({ bookingId: confirmed.id }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('pay-later checkout', () => {
  it('refuses bookings that are finished or released, whatever their payment status', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await paidBooking(f, 1, '15:00');
    for (const status of ['completed', 'cancelled', 'no_show', 'expired'] as const) {
      await db.update(schema.booking).set({ status }).where(eq(schema.booking.id, b.id));
      await expect(
        publicCaller(db).payment.createCheckout({ bookingId: b.id }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    }
  });
});

describe('payment lifecycle', () => {
  it('confirms on payment, idempotently, and never un-refunds', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await paidBooking(f, 2, '10:00');
    expect(await markBookingPaid(db, { bookingId: b.id, paymentId: 'cs_1' })).toBe('confirmed');
    expect(await load(b.id)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(await markBookingPaid(db, { bookingId: b.id })).toBe('already_settled');

    await recordRefundTotal(db, { bookingId: b.id, refundedCents: 1_000 });
    expect((await load(b.id)).paymentStatus).toBe('partially_refunded');
    await recordRefundTotal(db, { bookingId: b.id, refundedCents: 2_500 });
    expect((await load(b.id)).paymentStatus).toBe('refunded');
    // A late retry of the "paid" webhook must not flip it back.
    expect(await markBookingPaid(db, { bookingId: b.id })).toBe('already_settled');
    expect((await load(b.id)).paymentStatus).toBe('refunded');
  });

  it('flags a payment that lands after the slot was re-booked', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const first = await paidBooking(f, 2, '12:00');
    await db
      .update(schema.booking)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.booking.id, first.id));
    await expireStaleHolds(db);
    const second = await paidBooking(f, 2, '12:00', first.serviceId);
    expect(second.status).toBe('pending_payment');

    expect(await markBookingPaid(db, { bookingId: first.id })).toBe('needs_refund');
    expect(await load(first.id)).toMatchObject({ status: 'expired', paymentStatus: 'paid' });
  });

  it('ignores failure events for a superseded checkout', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await paidBooking(f, 2, '14:00');
    await db
      .update(schema.booking)
      .set({ paymentId: 'cs_new', paymentStatus: 'pending' })
      .where(eq(schema.booking.id, b.id));
    await markPaymentFailed(db, { bookingId: b.id, paymentId: 'cs_old', releaseHold: true });
    expect(await load(b.id)).toMatchObject({ status: 'pending_payment', paymentStatus: 'pending' });
    await markPaymentFailed(db, { bookingId: b.id, paymentId: 'cs_new', releaseHold: true });
    expect(await load(b.id)).toMatchObject({ status: 'expired', paymentStatus: 'failed' });
  });
});

describe('refunds', () => {
  it('are owner/admin only and bounded by what was paid', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await paidBooking(f, 3, '10:00');
    await db
      .update(schema.booking)
      .set({ paymentProvider: 'stripe', paymentId: 'cs_x', paymentStatus: 'pending' })
      .where(eq(schema.booking.id, b.id));
    await markBookingPaid(db, { bookingId: b.id, paymentId: 'cs_x' });

    const memberId = uid('usr');
    await addMember(db, f.orgId, memberId, 'member');
    await expect(
      userCaller(db, memberId, f.orgId).payment.refund({ bookingId: b.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      userCaller(db, f.ownerId, f.orgId).payment.refund({ bookingId: b.id, amountCents: 99_999 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
