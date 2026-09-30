import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncStripeInvoiceStatus } from '../src/invoicing/issue';
import { stripeRefundTarget } from '../src/payments/lifecycle';
import { createTestDb, type Fixture, seedOrg, uid, userCaller } from './helpers/harness';

// A fake Stripe client that records calls — refunds must hit the right
// object on the right account without any network.
const calls: Array<{ method: string; args: unknown[] }> = [];
let invoicePayment: { payment_intent?: string; charge?: string } | null = null;
const fakeStripe = {
  checkout: {
    sessions: {
      retrieve: async (...args: unknown[]) => {
        calls.push({ method: 'sessions.retrieve', args });
        return { payment_intent: 'pi_checkout' };
      },
    },
  },
  invoicePayments: {
    list: async (...args: unknown[]) => {
      calls.push({ method: 'invoicePayments.list', args });
      return { data: invoicePayment ? [{ payment: invoicePayment }] : [] };
    },
  },
  refunds: {
    create: async (...args: unknown[]) => {
      calls.push({ method: 'refunds.create', args });
      return { id: 're_1' };
    },
  },
};
vi.mock('../src/stripe', () => ({ getStripe: () => fakeStripe }));

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(() => {
  calls.length = 0;
  invoicePayment = { payment_intent: 'pi_invoice' };
});

async function paidBooking(
  f: Fixture,
  payment: { paymentId: string; paymentAccountId?: string | null; amountCents?: number | null },
) {
  const id = uid('bkg');
  await db.insert(schema.booking).values({
    id,
    organizationId: f.orgId,
    locationId: f.locationId,
    resourceId: f.resourceId,
    customerName: 'Paid Customer',
    slotStart: new Date('2031-01-01T10:00:00Z'),
    slotEnd: new Date('2031-01-01T10:30:00Z'),
    paymentStatus: 'paid',
    paymentProvider: 'stripe',
    paymentId: payment.paymentId,
    paymentAccountId: payment.paymentAccountId ?? null,
    amountCents: payment.amountCents === undefined ? 5_000 : payment.amountCents,
    currency: 'USD',
  });
  return id;
}

const call = (method: string) => calls.find((c) => c.method === method);

describe('refunding Stripe payments', () => {
  it('refunds an invoice-paid booking through the invoice payment on the tenant account', async () => {
    const f = await seedOrg(db);
    // Bookings paid via invoice before the account was recorded: fall back
    // to the tenant's Connect account.
    await db
      .update(schema.tenantSettings)
      .set({ stripeAccountId: 'acct_tenant', stripeChargesEnabled: true })
      .where(eq(schema.tenantSettings.organizationId, f.orgId));
    const id = await paidBooking(f, { paymentId: 'in_123', paymentAccountId: null });

    const res = await userCaller(db, f.ownerId, f.orgId).payment.refund({ bookingId: id });
    expect(res).toEqual({ ok: true, paymentStatus: 'refunded' });

    expect(call('sessions.retrieve')).toBeUndefined();
    expect(call('invoicePayments.list')?.args).toEqual([
      { invoice: 'in_123', status: 'paid', limit: 1 },
      { stripeAccount: 'acct_tenant' },
    ]);
    expect(call('refunds.create')?.args).toEqual([
      { payment_intent: 'pi_invoice', amount: 5_000 },
      { stripeAccount: 'acct_tenant' },
    ]);
  });

  it('still refunds Checkout payments via the session, on the recorded account', async () => {
    const f = await seedOrg(db);
    const id = await paidBooking(f, { paymentId: 'cs_456', paymentAccountId: 'acct_recorded' });
    await userCaller(db, f.ownerId, f.orgId).payment.refund({ bookingId: id, amountCents: 1_000 });
    expect(call('sessions.retrieve')?.args[0]).toBe('cs_456');
    expect(call('refunds.create')?.args).toEqual([
      { payment_intent: 'pi_checkout', amount: 1_000 },
      { stripeAccount: 'acct_recorded' },
    ]);
  });

  it('falls back to the charge, and errors clearly when the invoice has no payment', async () => {
    invoicePayment = { charge: 'ch_legacy' };
    await expect(stripeRefundTarget(fakeStripe as never, 'in_1', undefined)).resolves.toEqual({
      charge: 'ch_legacy',
    });
    invoicePayment = null;
    await expect(stripeRefundTarget(fakeStripe as never, 'in_1', undefined)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('syncStripeInvoiceStatus', () => {
  it('records the Connect account, paid time and amount when an invoice is paid', async () => {
    const f = await seedOrg(db);
    const bookingId = uid('bkg');
    await db.insert(schema.booking).values({
      id: bookingId,
      organizationId: f.orgId,
      locationId: f.locationId,
      resourceId: f.resourceId,
      customerName: 'Invoice Customer',
      slotStart: new Date('2031-02-01T10:00:00Z'),
      slotEnd: new Date('2031-02-01T10:30:00Z'),
    });
    await db.insert(schema.invoice).values({
      id: uid('inv'),
      organizationId: f.orgId,
      bookingId,
      provider: 'stripe',
      externalId: 'in_sync',
      amountCents: 7_500,
      currency: 'USD',
    });

    await syncStripeInvoiceStatus(
      db,
      { id: 'in_sync', number: 'INV-1', status: 'paid', total: 7_500, currency: 'usd' },
      { account: 'acct_connect' },
    );

    const [b] = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
    expect(b).toMatchObject({
      paymentStatus: 'paid',
      paymentId: 'in_sync',
      paymentAccountId: 'acct_connect',
      amountCents: 7_500,
      currency: 'USD',
    });
    expect(b!.paidAt).toBeInstanceOf(Date);
  });
});
