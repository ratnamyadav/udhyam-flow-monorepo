import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncStripeInvoiceStatus } from '../src/invoicing/issue';
import { openBookingCheckout } from '../src/payments/checkout';
import { capturePayment, recordRefundTotal, refundBooking } from '../src/payments/lifecycle';
import { recordProviderRefund, submitRefund } from '../src/payments/refunds';
import { createTestDb, type Fixture, seedOrg, uid } from './helpers/harness';

// Stripe double: records every call; each test scripts what it returns.
type Call = { method: string; args: unknown[] };
const calls: Call[] = [];
let listed: Array<{ id: string; status: string; metadata: Record<string, string> }> = [];
let createRefund: (...args: unknown[]) => Promise<{ id: string; status: string }>;
let createSession: (...args: unknown[]) => Promise<{ id: string; url: string }>;
const record =
  <T>(method: string, fn: (...args: unknown[]) => Promise<T>) =>
  (...args: unknown[]) => {
    calls.push({ method, args });
    return fn(...args);
  };
const fakeStripe = {
  checkout: {
    sessions: {
      retrieve: record('sessions.retrieve', async () => ({ payment_intent: 'pi_checkout' })),
      create: record('sessions.create', (...args) => createSession(...args)),
    },
  },
  invoicePayments: {
    list: record('invoicePayments.list', async () => ({
      data: [{ payment: { payment_intent: 'pi_invoice' } }],
    })),
  },
  refunds: {
    list: record('refunds.list', async () => ({ data: listed })),
    retrieve: record('refunds.retrieve', async (id) => ({ id, status: 'succeeded' })),
    create: record('refunds.create', (...args) => createRefund(...args)),
  },
};
vi.mock('../src/stripe', () => ({ getStripe: () => fakeStripe }));

const stripeError = (type: string, statusCode: number | undefined, message: string) =>
  Object.assign(new Error(message), { type, statusCode });
const made = (method: string) => calls.filter((c) => c.method === method);

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(() => {
  calls.length = 0;
  listed = [];
  createRefund = async () => ({ id: uid('re'), status: 'succeeded' });
  createSession = async () => ({ id: uid('cs'), url: 'https://stripe.test/pay' });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function booking(
  f: Fixture,
  values: Partial<typeof schema.booking.$inferInsert> = {},
): Promise<typeof schema.booking.$inferSelect> {
  const id = uid('bkg');
  await db.insert(schema.booking).values({
    id,
    organizationId: f.orgId,
    locationId: f.locationId,
    resourceId: f.resourceId,
    customerName: 'Refund Customer',
    // Each test seeds its own org (and resource), so slots never collide.
    slotStart: new Date('2032-01-01T10:00:00Z'),
    slotEnd: new Date('2032-01-01T10:30:00Z'),
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentProvider: 'stripe',
    paymentId: 'cs_paid',
    amountCents: 5_000,
    currency: 'USD',
    ...values,
  });
  return (await load(id))!;
}
const load = async (id: string) =>
  (await db.select().from(schema.booking).where(eq(schema.booking.id, id)))[0]!;
const refunds = (bookingId: string) =>
  db.select().from(schema.paymentRefund).where(eq(schema.paymentRefund.bookingId, bookingId));

describe('payment captured for a cancelled booking', () => {
  it('does not refund a redelivery for a booking staff cancelled and kept paid', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    // Paid, then cancelled by staff with refund=false (kept as a fee).
    const b = await booking(f, { status: 'cancelled' });

    const res = await capturePayment(db, {
      bookingId: b.id,
      paymentId: 'cs_paid',
      provider: 'stripe',
    });
    expect(res.outcome).toBe('already_settled');
    expect(made('refunds.create')).toHaveLength(0);
    expect(await load(b.id)).toMatchObject({ paymentStatus: 'paid', refundedCents: 0 });
  });

  it('refunds money captured for a booking cancelled before payment landed', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await booking(f, { status: 'cancelled', paymentStatus: 'pending' });

    const res = await capturePayment(db, {
      bookingId: b.id,
      paymentId: 'cs_paid',
      provider: 'stripe',
    });
    expect(res.outcome).toBe('needs_refund');
    expect(made('refunds.create')).toHaveLength(1);
    expect(res.booking).toMatchObject({ paymentStatus: 'refunded', refundedCents: 5_000 });

    // The provider redelivers: nothing more is refunded.
    await capturePayment(db, { bookingId: b.id, paymentId: 'cs_paid', provider: 'stripe' });
    expect(made('refunds.create')).toHaveLength(1);
  });
});

describe('retrying a Stripe refund', () => {
  async function staleRow(f: Fixture, providerRefundId: string | null = null) {
    const b = await booking(f, { refundReservedCents: 5_000 });
    const id = uid('rfd');
    await db.insert(schema.paymentRefund).values({
      id,
      bookingId: b.id,
      provider: 'stripe',
      paymentId: 'cs_paid',
      providerRefundId,
      amountCents: 5_000,
      reservationCents: 5_000,
      status: providerRefundId ? 'pending' : 'created',
      error: 'timeout',
      createdAt: new Date(Date.now() - 3 * 24 * 3600_000),
    });
    const row = (
      await db.select().from(schema.paymentRefund).where(eq(schema.paymentRefund.id, id))
    )[0]!;
    return { b, row };
  }

  it('adopts the refund Stripe already made instead of creating another', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const { b, row } = await staleRow(f);
    listed = [
      { id: 're_other', status: 'succeeded', metadata: { refundId: 'rfd_someone_else' } },
      { id: 're_earlier', status: 'succeeded', metadata: { refundId: row.id } },
    ];

    const done = await submitRefund(db, row);
    expect(done).toMatchObject({ status: 'succeeded', providerRefundId: 're_earlier' });
    expect(made('refunds.create')).toHaveLength(0);
    expect(made('refunds.list')[0]!.args[0]).toMatchObject({ payment_intent: 'pi_checkout' });
    expect(await load(b.id)).toMatchObject({
      paymentStatus: 'refunded',
      refundedCents: 5_000,
      refundReservedCents: 0,
    });
  });

  it('re-reads a refund Stripe already acknowledged', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const { row } = await staleRow(f, 're_known');
    await expect(submitRefund(db, row)).resolves.toMatchObject({ status: 'succeeded' });
    expect(made('refunds.retrieve')[0]!.args[0]).toBe('re_known');
    expect(made('refunds.list')).toHaveLength(0);
    expect(made('refunds.create')).toHaveLength(0);
  });
});

describe('refund ledger', () => {
  it('reverses a refund that fails after Stripe reported it succeeded', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await booking(f);
    const res = await refundBooking(db, b, 2_000);
    expect(res).toMatchObject({ paymentStatus: 'partially_refunded', refundedCents: 2_000 });
    const [row] = await refunds(b.id);

    await recordProviderRefund(db, {
      bookingId: b.id,
      provider: 'stripe',
      localId: row!.id,
      providerRefundId: row!.providerRefundId!,
      amountCents: 2_000,
      status: 'failed',
    });
    expect((await refunds(b.id))[0]).toMatchObject({ status: 'failed' });
    expect(await load(b.id)).toMatchObject({
      paymentStatus: 'paid',
      refundedCents: 0,
      refundCompletedCents: 0,
      refundReservedCents: 0,
    });
    // A repeated failure event changes nothing further.
    await recordProviderRefund(db, {
      bookingId: b.id,
      provider: 'stripe',
      localId: row!.id,
      providerRefundId: row!.providerRefundId!,
      amountCents: 2_000,
      status: 'failed',
    });
    expect((await load(b.id)).refundCompletedCents).toBe(0);
  });

  it('does not count a pending or failed refund through the charge total', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await booking(f);
    const pendingId = uid('re');
    createRefund = async () => ({ id: pendingId, status: 'pending' });
    await refundBooking(db, b);
    // Stripe's charge total already includes the pending refund.
    await recordRefundTotal(db, { bookingId: b.id, refundedCents: 5_000 });
    expect(await load(b.id)).toMatchObject({ paymentStatus: 'paid', refundedCents: 0 });

    // It fails: the row is released and the (re-fetched) total drops back.
    const [row] = await refunds(b.id);
    await recordProviderRefund(db, {
      bookingId: b.id,
      provider: 'stripe',
      localId: row!.id,
      providerRefundId: pendingId,
      amountCents: 5_000,
      status: 'failed',
    });
    await recordRefundTotal(db, { bookingId: b.id, refundedCents: 0 });
    expect(await load(b.id)).toMatchObject({
      paymentStatus: 'paid',
      refundedCents: 0,
      refundReservedCents: 0,
    });

    // A refund made in the Stripe dashboard (not in our ledger) still counts.
    await recordRefundTotal(db, { bookingId: b.id, refundedCents: 1_500 });
    expect(await load(b.id)).toMatchObject({
      paymentStatus: 'partially_refunded',
      refundedCents: 1_500,
    });
  });

  it('refunds the remaining balance when a partial refund is still pending', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await booking(f);
    createRefund = async () => ({ id: uid('re'), status: 'pending' });
    await refundBooking(db, b, 1_000);

    createRefund = async () => ({ id: uid('re'), status: 'succeeded' });
    const res = await refundBooking(db, await load(b.id));
    expect(made('refunds.create').map((c) => (c.args[0] as { amount: number }).amount)).toEqual([
      1_000, 4_000,
    ]);
    expect(res).toMatchObject({ pending: false, refundedCents: 4_000 });

    // Everything is now refunded or in flight: a further full refund reuses
    // the pending row rather than failing or reserving more.
    const again = await refundBooking(db, await load(b.id));
    expect(again.pending).toBe(true);
    expect(made('refunds.create')).toHaveLength(2);
  });
});

describe('refund gateway errors', () => {
  it('fails the refund and releases the reservation when Stripe rejects it', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await booking(f);
    createRefund = async () => {
      throw stripeError('StripeInvalidRequestError', 400, 'Charge ch_1 has already been refunded.');
    };
    await expect(refundBooking(db, b)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('already been refunded'),
    });
    expect((await refunds(b.id))[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('already been refunded'),
    });
    expect(await load(b.id)).toMatchObject({ paymentStatus: 'paid', refundReservedCents: 0 });
  });

  it('keeps the refund retryable when the outcome is unknown', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await booking(f);
    createRefund = async () => {
      throw stripeError('StripeConnectionError', undefined, 'socket hang up');
    };
    await expect(refundBooking(db, b)).rejects.toMatchObject({ code: 'BAD_GATEWAY' });
    expect((await refunds(b.id))[0]).toMatchObject({ status: 'created', error: 'socket hang up' });
    expect((await load(b.id)).refundReservedCents).toBe(5_000);
  });

  it('checks Cashfree for an earlier attempt before posting a retry', async () => {
    const f = await seedOrg(db, { currency: 'INR' });
    const b = await booking(f, {
      paymentProvider: 'cashfree',
      paymentId: 'pmt_order',
      currency: 'INR',
      refundReservedCents: 5_000,
    });
    const id = `rfd_${uid('x').replace(/[^a-z0-9]/gi, '')}`;
    await db.insert(schema.paymentRefund).values({
      id,
      bookingId: b.id,
      provider: 'cashfree',
      paymentId: 'pmt_order',
      amountCents: 5_000,
      reservationCents: 5_000,
      error: 'timeout',
    });
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push(`${init?.method} ${new URL(url).pathname}`);
        return Response.json({ refund_id: id, refund_status: 'SUCCESS' });
      }),
    );
    const row = (
      await db.select().from(schema.paymentRefund).where(eq(schema.paymentRefund.id, id))
    )[0]!;
    await expect(submitRefund(db, row)).resolves.toMatchObject({ status: 'succeeded' });
    expect(requests).toEqual([`GET /pg/orders/pmt_order/refunds/${id}`]);
    expect(await load(b.id)).toMatchObject({ paymentStatus: 'refunded', refundReservedCents: 0 });
  });

  it('fails a refund Cashfree rejects outright', async () => {
    const f = await seedOrg(db, { currency: 'INR' });
    const b = await booking(f, {
      paymentProvider: 'cashfree',
      paymentId: 'pmt_rejected',
      currency: 'INR',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ message: 'refund amount exceeds balance' }, { status: 400 }),
      ),
    );
    await expect(refundBooking(db, b)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await refunds(b.id))[0]).toMatchObject({ status: 'failed' });
    expect((await load(b.id)).refundReservedCents).toBe(0);
  });
});

describe('checkout attempts', () => {
  it('retires an attempt Stripe rejected so the next try uses a new key', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await booking(f, {
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      paymentProvider: null,
      paymentId: null,
      holdExpiresAt: new Date(Date.now() + 30 * 60_000),
    });
    createSession = async () => {
      throw stripeError('StripeInvalidRequestError', 400, 'Invalid currency');
    };
    await expect(openBookingCheckout(db, b, f.slug, 'Consult')).rejects.toThrow('Invalid currency');
    createSession = async () => ({ id: 'cs_ok', url: 'https://stripe.test/ok' });
    await expect(openBookingCheckout(db, b, f.slug, 'Consult')).resolves.toEqual({
      redirectUrl: 'https://stripe.test/ok',
    });
    const keys = made('sessions.create').map(
      (c) => (c.args[1] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe('a booking paid twice through a Stripe invoice', () => {
  it('refunds the invoice payment as a duplicate', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    const b = await booking(f, { paymentAccountId: 'acct_t' });
    await db.insert(schema.invoice).values({
      id: uid('inv'),
      organizationId: f.orgId,
      bookingId: b.id,
      provider: 'stripe',
      externalId: 'in_second',
      amountCents: 5_000,
      currency: 'USD',
    });
    const inv = { id: 'in_second', number: '1', status: 'paid', total: 5_000, currency: 'usd' };
    await syncStripeInvoiceStatus(db, { ...inv, amount_paid: 5_000 }, { account: 'acct_t' });
    expect(made('refunds.create')[0]!.args).toEqual([
      expect.objectContaining({ payment_intent: 'pi_invoice', amount: 5_000, reason: 'duplicate' }),
      expect.objectContaining({ stripeAccount: 'acct_t' }),
    ]);
    expect(await load(b.id)).toMatchObject({ paymentId: 'cs_paid', paymentStatus: 'paid' });

    // Checkout-generated and out-of-band invoices carry no second charge.
    calls.length = 0;
    await syncStripeInvoiceStatus(db, { ...inv, metadata: { attemptId: 'pmt_1' } });
    await syncStripeInvoiceStatus(db, { ...inv, paid_out_of_band: true });
    expect(made('refunds.create')).toHaveLength(0);
  });
});
