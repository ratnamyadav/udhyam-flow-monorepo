import { readFileSync } from 'node:fs';
import { type Db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { serverEnvSchema } from '../../env/src/server';
import { cashfreeRefund } from '../src/cashfree';
import { autoInvoiceIfEnabled, issueInvoiceForBooking } from '../src/invoicing/issue';
import { generateSlots } from '../src/lib/slots';
import { formatInTz } from '../src/lib/time';
import { markBookingPaid, recordRefundTotal, refundBooking } from '../src/payments/lifecycle';
import {
  addMember,
  addService,
  createTestDb,
  publicCaller,
  seedOrg,
  slotOn,
  uid,
  userCaller,
} from './helpers/harness';
import { updateAfter } from './helpers/race';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(() => vi.restoreAllMocks());

async function createBooking(price = 2500) {
  const f = await seedOrg(db);
  const serviceId = await addService(db, f.orgId, { priceCents: price });
  const { start } = slotOn(f, 2, '10:00');
  const b = await publicCaller(db).booking.create({
    orgSlug: f.slug,
    locationId: f.locationId,
    resourceId: f.resourceId,
    serviceId,
    customerName: 'Audit Customer',
    slotStart: start.toISOString(),
  });
  return { f, b, serviceId };
}

it('prevents an invoice using an edited catalog price instead of the booking snapshot', async () => {
  const { f, b, serviceId } = await createBooking();
  await db
    .update(schema.tenantSettings)
    .set({ invoiceProvider: 'udyamflow' })
    .where(eq(schema.tenantSettings.organizationId, f.orgId));
  await db.update(schema.service).set({ priceCents: 9000 }).where(eq(schema.service.id, serviceId));
  const invoice = await issueInvoiceForBooking(db, {
    organizationId: f.orgId,
    bookingId: b.id,
    send: false,
  });
  expect(b.amountCents).toBe(2500);
  expect(invoice.amountCents).toBe(2500);
});

it('prevents a member creating a financial plan and issuing an invoice', async () => {
  const { f, b, serviceId } = await createBooking();
  const userId = uid('usr');
  await addMember(db, f.orgId, userId, 'member');
  const caller = userCaller(db, userId, f.orgId);
  await expect(
    caller.membership.createPlan({
      name: 'Unauthorized Plan',
      amountCents: 5000,
      interval: 'month',
      intervalCount: 1,
      currency: 'INR',
      serviceIds: [serviceId],
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await db
    .update(schema.tenantSettings)
    .set({ invoiceProvider: 'udyamflow' })
    .where(eq(schema.tenantSettings.organizationId, f.orgId));
  await expect(caller.invoicing.create({ bookingId: b.id, send: false })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
});

it('prevents identical refund IDs across calls for a real booking ID', async () => {
  const ids: string[] = [];
  const mockFetch = vi.fn(async (_url, init) => {
    ids.push(JSON.parse(String(init?.body)).refund_id);
    return Response.json({ refund_status: 'SUCCESS' });
  }) as unknown as typeof fetch;
  const orderId = 'bkg_12345678-1234-4234-8234-123456789012__attempt';
  vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
  await cashfreeRefund({ orderId, amountPaise: 1000 }, mockFetch);
  await cashfreeRefund({ orderId, amountPaise: 500 }, mockFetch);
  expect(ids[0]).not.toBe(ids[1]);
  expect(ids[0]!.length).toBeLessThanOrEqual(40);
});

it('prevents marking a pending gateway refund as completed locally', async () => {
  const { b } = await createBooking();
  await db
    .update(schema.booking)
    .set({ paymentStatus: 'paid', paymentProvider: 'cashfree', paymentId: `${b.id}__attempt` })
    .where(eq(schema.booking.id, b.id));
  const row = (await db.select().from(schema.booking).where(eq(schema.booking.id, b.id)))[0]!;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ refund_status: 'PENDING', refund_id: 'rfd_test' })),
  );
  try {
    await expect(refundBooking(db, row)).resolves.toMatchObject({
      paymentStatus: 'paid',
      refundedCents: 0,
      pending: true,
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('prevents the example optional env values failing validation', () => {
  const example = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
  const env: Record<string, string> = {};
  for (const line of example.split('\n')) {
    const match = line.match(/^([A-Z_]+)="([^"]*)"/);
    if (match) env[match[1]!] = match[2]!;
  }
  const result = serverEnvSchema.safeParse(env);
  expect(result.success).toBe(true);
});

it('prevents payment success resurrecting a concurrently cancelled booking', async () => {
  const { b } = await createBooking();
  await db
    .update(schema.booking)
    .set({ status: 'pending_payment', paymentStatus: 'pending' })
    .where(eq(schema.booking.id, b.id));
  const racingDb = updateAfter(db, async () => {
    await db.update(schema.booking).set({ status: 'cancelled' }).where(eq(schema.booking.id, b.id));
  });
  expect(await markBookingPaid(racingDb, { bookingId: b.id })).toBe('needs_refund');
  expect(
    (await db.select().from(schema.booking).where(eq(schema.booking.id, b.id)))[0]!.status,
  ).toBe('cancelled');
});

// The gateway total may go down (a refund failed), but never below what the
// ledger has completed — even if a refund completes while the total is applied.
it('prevents a stale refund webhook lowering the stored cumulative amount', async () => {
  const { b } = await createBooking();
  await db
    .update(schema.booking)
    .set({ paymentStatus: 'paid', refundedCents: 0 })
    .where(eq(schema.booking.id, b.id));
  const racingDb = updateAfter(db, async () => {
    await db
      .update(schema.booking)
      .set({ refundCompletedCents: 2000, refundedCents: 2000, paymentStatus: 'partially_refunded' })
      .where(eq(schema.booking.id, b.id));
  });
  await recordRefundTotal(racingDb, { bookingId: b.id, refundedCents: 1000 });
  expect(
    (await db.select().from(schema.booking).where(eq(schema.booking.id, b.id)))[0]!.refundedCents,
  ).toBe(2000);
});

it('prevents a built-in invoice staying open after its booking is paid', async () => {
  const { f, b } = await createBooking();
  await db
    .update(schema.tenantSettings)
    .set({ invoiceProvider: 'udyamflow', autoInvoice: true })
    .where(eq(schema.tenantSettings.organizationId, f.orgId));
  const invoice = await issueInvoiceForBooking(db, {
    organizationId: f.orgId,
    bookingId: b.id,
    send: false,
  });
  await markBookingPaid(db, { bookingId: b.id });
  await autoInvoiceIfEnabled(db, b.id);
  expect(
    (await db.select().from(schema.invoice).where(eq(schema.invoice.id, invoice.id)))[0]!.status,
  ).toBe('paid');
});

it('prevents duplicate and mislabeled slots on the spring DST transition', () => {
  const slots = generateSlots({
    date: '2026-03-08',
    timezone: 'America/New_York',
    openMin: 60,
    closeMin: 240,
    slotMin: 30,
    taken: [],
    now: new Date('2026-03-01T00:00:00Z'),
  });
  expect(new Set(slots.map((s) => s.start)).size).toBe(slots.length);
  expect(
    slots.some((s) => formatInTz(new Date(s.start), 'America/New_York', 'HH:mm') !== s.displayTime),
  ).toBe(false);
});

it('prevents a new Cashfree order being created for every checkout retry', async () => {
  vi.stubEnv('CASHFREE_CLIENT_ID', 'audit_dummy');
  vi.stubEnv('CASHFREE_CLIENT_SECRET', 'audit_dummy');
  const ids: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      ids.push(JSON.parse(String(init?.body)).order_id);
      return Response.json({ payment_session_id: 'audit_session' });
    }),
  );
  try {
    const { b } = await createBooking();
    await publicCaller(db).payment.createCheckout({ bookingId: b.id });
    await publicCaller(db).payment.createCheckout({ bookingId: b.id });
    expect(ids).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
