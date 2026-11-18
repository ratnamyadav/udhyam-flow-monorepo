import { randomUUID } from 'node:crypto';
import { type Db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { encrypt } from '../src/crypto';
import { syncInvoicePayment } from '../src/invoicing/issue';
import { markBookingPaid } from '../src/payments/lifecycle';
import { MAX_HOLD_MINUTES } from '../src/payments/providers';
import { addService, createTestDb, publicCaller, seedOrg, slotOn } from './helpers/harness';
import { updateAfter } from './helpers/race';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function createBooking(price = 2500) {
  const f = await seedOrg(db);
  const serviceId = await addService(db, f.orgId, { priceCents: price });
  const { start } = slotOn(f, 2, '10:00');
  const b = await publicCaller(db).booking.create({
    orgSlug: f.slug,
    locationId: f.locationId,
    resourceId: f.resourceId,
    serviceId,
    customerName: 'Launch Customer',
    slotStart: start.toISOString(),
  });
  return { f, b, serviceId };
}

const bookingRow = async (id: string) =>
  (await db.select().from(schema.booking).where(eq(schema.booking.id, id)))[0]!;

it('flags a pay-later payment for refund when staff cancel during checkout', async () => {
  const { b } = await createBooking();
  await db
    .update(schema.booking)
    .set({ status: 'confirmed', paymentStatus: 'pending', paymentId: 'cs_paylater' })
    .where(eq(schema.booking.id, b.id));
  const racingDb = updateAfter(db, async () => {
    await db.update(schema.booking).set({ status: 'cancelled' }).where(eq(schema.booking.id, b.id));
  });
  expect(await markBookingPaid(racingDb, { bookingId: b.id, paymentId: 'cs_paylater' })).toBe(
    'needs_refund',
  );
  expect((await bookingRow(b.id)).status).toBe('cancelled');
});

it('still confirms a pay-later payment when nothing races it', async () => {
  const { b } = await createBooking();
  await db
    .update(schema.booking)
    .set({ status: 'confirmed', paymentStatus: 'pending' })
    .where(eq(schema.booking.id, b.id));
  expect(await markBookingPaid(db, { bookingId: b.id })).toBe('confirmed');
  expect((await bookingRow(b.id)).paymentStatus).toBe('paid');
});

it('stops checkout retries from holding a slot past the ceiling', async () => {
  vi.stubEnv('CASHFREE_CLIENT_ID', 'launch_dummy');
  vi.stubEnv('CASHFREE_CLIENT_SECRET', 'launch_dummy');
  const fetchMock = vi.fn(async () => Response.json({ payment_session_id: 'launch_session' }));
  vi.stubGlobal('fetch', fetchMock);
  const { b } = await createBooking();
  await db
    .update(schema.booking)
    .set({
      createdAt: new Date(Date.now() - (MAX_HOLD_MINUTES - 10) * 60_000),
      holdExpiresAt: new Date(Date.now() + 2 * 60_000),
    })
    .where(eq(schema.booking.id, b.id));
  await expect(publicCaller(db).payment.createCheckout({ bookingId: b.id })).rejects.toThrow(
    /hold on this slot expired/,
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await bookingRow(b.id)).status).toBe('expired');
});

it('marks a built-in invoice paid when a pay-later booking is paid', async () => {
  const { f, b } = await createBooking();
  await db
    .update(schema.booking)
    .set({ status: 'confirmed', paymentStatus: 'unpaid' })
    .where(eq(schema.booking.id, b.id));
  const invoiceId = randomUUID();
  await db.insert(schema.invoice).values({
    id: invoiceId,
    organizationId: f.orgId,
    bookingId: b.id,
    provider: 'udyamflow',
    status: 'open',
    amountCents: 2500,
    currency: 'INR',
  });
  await markBookingPaid(db, { bookingId: b.id });
  expect(
    (await db.select().from(schema.invoice).where(eq(schema.invoice.id, invoiceId)))[0]!.status,
  ).toBe('paid');
});

async function freshbooksInvoice() {
  vi.stubEnv('FRESHBOOKS_CLIENT_ID', 'fb_id');
  vi.stubEnv('FRESHBOOKS_CLIENT_SECRET', 'fb_secret');
  vi.stubEnv('ENCRYPTION_KEY', 'launch-key-launch-key-launch-key-00');
  const { f, b } = await createBooking();
  await db
    .update(schema.booking)
    .set({ status: 'confirmed', paymentStatus: 'paid', paymentProvider: 'cashfree' })
    .where(eq(schema.booking.id, b.id));
  await db.insert(schema.integrationConnection).values({
    id: randomUUID(),
    organizationId: f.orgId,
    provider: 'freshbooks',
    accessToken: encrypt('fb_token'),
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
    externalAccountId: 'acct1',
  });
  const invoiceId = randomUUID();
  await db.insert(schema.invoice).values({
    id: invoiceId,
    organizationId: f.orgId,
    bookingId: b.id,
    provider: 'freshbooks',
    externalId: '777',
    status: 'open',
    amountCents: 2500,
    currency: 'INR',
  });
  const invoiceStatus = async () =>
    (await db.select().from(schema.invoice).where(eq(schema.invoice.id, invoiceId)))[0]!.status;
  return { b, invoiceStatus };
}

it('records a later payment on an invoice already issued in FreshBooks', async () => {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? 'null')) });
      return Response.json({ response: { result: {} } });
    }),
  );
  const { b, invoiceStatus } = await freshbooksInvoice();
  await syncInvoicePayment(db, b.id);
  await syncInvoicePayment(db, b.id); // a redelivery records nothing more
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toContain('/accounting/account/acct1/payments/payments');
  expect(calls[0]!.body).toMatchObject({
    payment: { invoiceid: 777, amount: { amount: '25.00' } },
  });
  expect(await invoiceStatus()).toBe('paid');
});

it('leaves the invoice unpaid for a retry when FreshBooks rejects the payment', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ response: { errors: [{ message: 'nope' }] } }, { status: 500 }),
    ),
  );
  const { b, invoiceStatus } = await freshbooksInvoice();
  await syncInvoicePayment(db, b.id);
  expect(await invoiceStatus()).toBe('open');
});

it('backfills invoice snapshots on bookings made before they existed', async () => {
  const { b, serviceId } = await createBooking(4200);
  await db
    .update(schema.booking)
    .set({ amountCents: null, currency: null, serviceSnapshot: null })
    .where(eq(schema.booking.id, b.id));
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(
    new URL('../../db/migrations/0006_backfill_booking_snapshots.sql', import.meta.url),
    'utf8',
  );
  await db.execute(sql);
  // Later catalog edits no longer reach the booking.
  await db.update(schema.service).set({ priceCents: 9900 }).where(eq(schema.service.id, serviceId));
  const row = await bookingRow(b.id);
  expect(row.amountCents).toBe(4200);
  expect(row.currency).toBe('INR');
  expect(row.serviceSnapshot).toMatchObject({ gstRateBps: 1800, gstExempt: false });
});
