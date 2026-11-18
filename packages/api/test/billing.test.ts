import { type Db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCashfreeBilling,
  BILLING_GRACE_MS,
  billingAccessFor,
  locationBillingAccess,
  startLocationSubscription,
  trialEnd,
} from '../src/billing/service';
import { cycleEnd } from '../src/memberships/credits';
import type { SubscriptionWebhookEvent } from '../src/memberships/webhook';
import { createTestDb, seedOrg, uid } from './helpers/harness';

const stripe = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: stripe.create } } }),
}));

const DAY = 24 * 60 * 60_000;
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(() => {
  stripe.create.mockReset();
});
afterEach(() => vi.useRealTimers());

// An org whose six-month trial ended `endedAgoMs` ago.
async function orgAfterTrial(endedAgoMs: number, currency: 'USD' | 'INR' = 'INR') {
  const f = await seedOrg(db, { currency });
  const createdAt = cycleEnd(new Date(Date.now() - endedAgoMs), 'month', -6);
  await db
    .update(schema.organization)
    .set({ createdAt })
    .where(eq(schema.organization.id, f.orgId));
  return { ...f, trialUntil: trialEnd(createdAt) };
}

async function addSubscription(
  f: { orgId: string; locationId: string },
  values: Partial<typeof schema.locationSubscription.$inferInsert> = {},
) {
  const id = uid('bill');
  await db.insert(schema.locationSubscription).values({
    id,
    organizationId: f.orgId,
    locationId: f.locationId,
    provider: 'cashfree',
    amountCents: 29_900,
    currency: 'INR',
    ...values,
  });
  return id;
}

const subscription = async (id: string) =>
  (
    await db
      .select()
      .from(schema.locationSubscription)
      .where(eq(schema.locationSubscription.id, id))
  )[0]!;

describe('billing grace period', () => {
  it('keeps a renewing subscription open for the grace period after paidUntil', async () => {
    const f = await orgAfterTrial(60 * DAY);
    const paidUntil = new Date(Date.now() - DAY);
    await addSubscription(f, { status: 'active', paidUntil });
    const at = (ms: number) => locationBillingAccess(db, f.orgId, f.locationId, new Date(ms));
    expect(await at(paidUntil.getTime() - 1)).toBe(true);
    expect(await at(paidUntil.getTime() + BILLING_GRACE_MS - 1)).toBe(true);
    expect(await at(paidUntil.getTime() + BILLING_GRACE_MS)).toBe(false);
  });

  it('applies grace to past_due but not to cancelled subscriptions', async () => {
    const paidUntil = new Date(Date.now() - DAY);
    const pastDue = await orgAfterTrial(60 * DAY);
    await addSubscription(pastDue, { status: 'past_due', paidUntil });
    expect(await locationBillingAccess(db, pastDue.orgId, pastDue.locationId)).toBe(true);

    const cancelled = await orgAfterTrial(60 * DAY);
    await addSubscription(cancelled, { status: 'cancelled', paidUntil });
    expect(await locationBillingAccess(db, cancelled.orgId, cancelled.locationId)).toBe(false);
    const inside = new Date(paidUntil.getTime() - 1);
    expect(await locationBillingAccess(db, cancelled.orgId, cancelled.locationId, inside)).toBe(
      true,
    );
  });

  it('gives grace after trial end only to locations with a renewing subscription', async () => {
    const bare = await orgAfterTrial(DAY);
    expect(await locationBillingAccess(db, bare.orgId, bare.locationId)).toBe(false);
    const pending = await orgAfterTrial(DAY);
    await addSubscription(pending, { status: 'pending' });
    expect(await locationBillingAccess(db, pending.orgId, pending.locationId)).toBe(false);

    const renewing = await orgAfterTrial(DAY);
    await addSubscription(renewing, { status: 'active', provider: 'stripe', currency: 'USD' });
    expect(await locationBillingAccess(db, renewing.orgId, renewing.locationId)).toBe(true);
    const after = new Date(renewing.trialUntil.getTime() + BILLING_GRACE_MS);
    expect(await locationBillingAccess(db, renewing.orgId, renewing.locationId, after)).toBe(false);
  });

  it('reports the state the billing page shows', () => {
    const trialUntil = new Date('2026-01-01T00:00:00Z');
    const paidUntil = new Date('2026-03-01T00:00:00Z');
    const active = [{ status: 'active' as const, paidUntil }];
    expect(billingAccessFor(trialUntil, active, new Date('2025-12-01')).state).toBe('trial');
    expect(billingAccessFor(trialUntil, active, new Date('2026-02-01')).state).toBe('paid');
    expect(billingAccessFor(trialUntil, active, new Date('2026-03-02'))).toEqual({
      state: 'grace',
      paidUntil,
      accessUntil: new Date(paidUntil.getTime() + BILLING_GRACE_MS),
    });
    expect(billingAccessFor(trialUntil, active, new Date('2026-03-05')).state).toBe('none');
    const cancelled = [{ status: 'cancelled' as const, paidUntil }];
    expect(billingAccessFor(trialUntil, cancelled, new Date('2026-02-01')).accessUntil).toEqual(
      paidUntil,
    );
  });
});

describe('Cashfree mandate activation', () => {
  const event = (
    subscriptionId: string,
    patch: Partial<SubscriptionWebhookEvent>,
  ): SubscriptionWebhookEvent => ({
    type: 'SUBSCRIPTION_STATUS_CHANGED',
    subscriptionId,
    cfSubscriptionId: null,
    subscriptionStatus: null,
    nextScheduleDate: null,
    authorizationStatus: null,
    payment: null,
    ...patch,
  });

  it('grants access until the first scheduled charge, which then extends once', async () => {
    const f = await orgAfterTrial(30 * DAY);
    const id = await addSubscription(f, { status: 'pending' });
    expect(await locationBillingAccess(db, f.orgId, f.locationId)).toBe(false);

    const firstCharge = new Date(Math.floor((Date.now() + 2 * DAY) / 1000) * 1000);
    await applyCashfreeBilling(
      db,
      event(id, { subscriptionStatus: 'ACTIVE', nextScheduleDate: firstCharge.toISOString() }),
    );
    expect(await subscription(id)).toMatchObject({ status: 'active', paidUntil: firstCharge });
    expect(await locationBillingAccess(db, f.orgId, f.locationId)).toBe(true);

    await applyCashfreeBilling(
      db,
      event(id, {
        type: 'SUBSCRIPTION_PAYMENT_SUCCESS',
        payment: {
          key: uid('cfpay'),
          paymentType: 'CHARGE',
          amount: 299,
          status: 'SUCCESS',
          failureReason: null,
          paidAt: firstCharge.toISOString(),
        },
      }),
    );
    const oneCycle = cycleEnd(firstCharge, 'month', 1);
    expect((await subscription(id)).paidUntil).toEqual(oneCycle);

    // A later ACTIVE event (next month's schedule) doesn't add provisional time.
    await applyCashfreeBilling(
      db,
      event(id, {
        subscriptionStatus: 'ACTIVE',
        nextScheduleDate: cycleEnd(oneCycle, 'month', 1).toISOString(),
      }),
    );
    expect((await subscription(id)).paidUntil).toEqual(oneCycle);
  });

  it('treats a successful AUTH payment as activation when no schedule is known', async () => {
    const f = await orgAfterTrial(30 * DAY);
    const id = await addSubscription(f, { status: 'pending' });
    const before = Date.now();
    await applyCashfreeBilling(
      db,
      event(id, {
        type: 'SUBSCRIPTION_PAYMENT_SUCCESS',
        payment: {
          key: uid('cfauth'),
          paymentType: 'AUTH',
          amount: 1,
          status: 'SUCCESS',
          failureReason: null,
        },
      }),
    );
    const paidUntil = (await subscription(id)).paidUntil!.getTime();
    expect(paidUntil).toBeGreaterThan(before + DAY);
    expect(paidUntil).toBeLessThan(before + 7 * DAY);
    expect(await locationBillingAccess(db, f.orgId, f.locationId)).toBe(true);
    // No billing payment is recorded for the authorization itself.
    expect(
      await db
        .select()
        .from(schema.billingPayment)
        .where(eq(schema.billingPayment.subscriptionId, id)),
    ).toHaveLength(0);
  });

  it('does not grant access to a cancelled subscription', async () => {
    const f = await orgAfterTrial(30 * DAY);
    const id = await addSubscription(f, { status: 'cancelled' });
    await applyCashfreeBilling(
      db,
      event(id, {
        subscriptionStatus: 'ACTIVE',
        nextScheduleDate: new Date(Date.now() + DAY).toISOString(),
      }),
    );
    expect(await subscription(id)).toMatchObject({ status: 'cancelled', paidUntil: null });
  });
});

describe('Stripe billing checkout retry', () => {
  const MIN = 60_000;
  const invalid = () =>
    Object.assign(new Error('expires_at must be at least 30 minutes away'), {
      type: 'StripeInvalidRequestError',
    });
  // Behaves like Stripe: enforces the 30-minute expires_at minimum.
  const stripeLike = (session: { id: string; url: string }) => (params: { expires_at: number }) => {
    if (params.expires_at * 1000 < Date.now() + 30 * MIN) throw invalid();
    return Promise.resolve({ ...session, status: 'open' });
  };
  const start = (f: { orgId: string; locationId: string }) =>
    startLocationSubscription(db, {
      orgId: f.orgId,
      locationId: f.locationId,
      customer: { name: 'Owner', email: 'owner@example.com' },
    });
  const call = (n: number) =>
    stripe.create.mock.calls[n] as [{ expires_at: number }, { idempotencyKey: string }];

  it('opens a fresh session when retried after a failed attempt', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    stripe.create.mockRejectedValueOnce(new Error('connection reset'));
    await expect(start(f)).rejects.toThrow('connection reset');
    const failed = call(0);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 5 * MIN);
    stripe.create.mockImplementation(stripeLike({ id: 'cs_retry', url: 'https://stripe.test/r' }));
    await expect(start(f)).resolves.toEqual({ url: 'https://stripe.test/r' });

    // The old attempt is replayed first (same key + params), then restarted.
    expect(stripe.create).toHaveBeenCalledTimes(3);
    expect(call(1)).toEqual(failed);
    const [params, opts] = call(2);
    expect(opts.idempotencyKey).not.toBe(failed[1].idempotencyKey);
    expect(params.expires_at * 1000).toBeGreaterThanOrEqual(Date.now() + 30 * MIN);

    // Reuses the open session.
    await expect(start(f)).resolves.toEqual({ url: 'https://stripe.test/r' });
    expect(stripe.create).toHaveBeenCalledTimes(3);

    // Once that session's expiry passes, the row is replaced.
    vi.setSystemTime(params.expires_at * 1000 + MIN);
    stripe.create.mockImplementation(stripeLike({ id: 'cs_new', url: 'https://stripe.test/n' }));
    await expect(start(f)).resolves.toEqual({ url: 'https://stripe.test/n' });
    const rows = await db
      .select()
      .from(schema.locationSubscription)
      .where(eq(schema.locationSubscription.locationId, f.locationId));
    expect(rows.map((r) => r.status).sort()).toEqual(['expired', 'pending']);
  });

  it('reuses a session Stripe created when the first response was lost', async () => {
    const f = await seedOrg(db, { currency: 'USD' });
    stripe.create.mockRejectedValueOnce(new Error('timeout'));
    await expect(start(f)).rejects.toThrow('timeout');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 5 * MIN);
    // The idempotent replay returns the session the lost request created.
    stripe.create.mockResolvedValueOnce({
      id: 'cs_lost',
      url: 'https://stripe.test/l',
      status: 'open',
    });
    await expect(start(f)).resolves.toEqual({ url: 'https://stripe.test/l' });
    expect(stripe.create).toHaveBeenCalledTimes(2);
    expect(call(1)).toEqual(call(0));
  });
});
