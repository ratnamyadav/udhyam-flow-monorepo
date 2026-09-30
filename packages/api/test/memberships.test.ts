import { createHmac } from 'node:crypto';
import type { Db } from '@udyamflow/db';
import { describe, expect, it, vi } from 'vitest';
import {
  CASHFREE_SUBSCRIPTIONS_API_VERSION,
  CashfreeApiError,
  CashfreeSubscriptionsClient,
  cashfreeBaseUrl,
} from '../src/memberships/cashfree-subscriptions';
import { ensureCashfreePlan, recordPayment, startSubscription } from '../src/memberships/service';
import {
  cashfreePlanIdFor,
  isTerminalSubscriptionStatus,
  mapPaymentStatus,
  mapSubscriptionStatus,
  normalizeIndianMobile,
  paiseToRupees,
  parseCashfreeTime,
  rupeesToPaise,
  toCashfreeIntervalType,
} from '../src/memberships/status';
import { parseSubscriptionWebhook, verifyCashfreeSignature } from '../src/memberships/webhook';

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function mockFetch(routes: Array<[RegExp, number, unknown]>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    calls.push({
      url: u,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const hit = routes.find(([re]) => re.test(`${method} ${u}`));
    if (!hit) return new Response('not mocked', { status: 500 });
    const [, status, body] = hit;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function client(
  routes: Array<[RegExp, number, unknown]>,
  env: 'sandbox' | 'production' = 'sandbox',
) {
  const m = mockFetch(routes);
  return {
    ...m,
    client: new CashfreeSubscriptionsClient({
      clientId: 'cf_id',
      clientSecret: 'cf_secret',
      env,
      fetch: m.fetch,
    }),
  };
}

describe('money + time helpers', () => {
  it('converts paise to rupees and back', () => {
    expect(paiseToRupees(200000)).toBe(2000);
    expect(paiseToRupees(4550)).toBe(45.5);
    expect(paiseToRupees(1)).toBe(0.01);
    expect(rupeesToPaise(2000)).toBe(200000);
    expect(rupeesToPaise('399.00')).toBe(39900);
    expect(rupeesToPaise(19.99)).toBe(1999); // float noise rounds away
    expect(rupeesToPaise(null)).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
  });

  it('parses IST timestamps with and without offsets', () => {
    expect(parseCashfreeTime('2055-08-07T10:30:46')?.toISOString()).toBe(
      '2055-08-07T05:00:46.000Z',
    );
    expect(parseCashfreeTime('2025-06-01 10:20:12')?.toISOString()).toBe(
      '2025-06-01T04:50:12.000Z',
    );
    expect(parseCashfreeTime('2025-06-01T10:20:12Z')?.toISOString()).toBe(
      '2025-06-01T10:20:12.000Z',
    );
    expect(parseCashfreeTime('2025-06-01')?.toISOString()).toBe('2025-05-31T18:30:00.000Z');
    expect(parseCashfreeTime(null)).toBeNull();
    expect(parseCashfreeTime('not a date')).toBeNull();
  });

  it('normalises Indian mobiles', () => {
    expect(normalizeIndianMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizeIndianMobile('919876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('09876-543210')).toBe('9876543210');
    expect(normalizeIndianMobile('9876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5876543210')).toBeNull(); // not a mobile prefix
    expect(normalizeIndianMobile('+1 415 555 0100')).toBeNull();
  });

  it('maps intervals and derives Cashfree-safe plan ids', () => {
    expect(toCashfreeIntervalType('week')).toBe('WEEK');
    expect(toCashfreeIntervalType('month')).toBe('MONTH');
    expect(toCashfreeIntervalType('year')).toBe('YEAR');
    expect(cashfreePlanIdFor('mpl_1b2c-3d')).toBe('mpl_1b2c-3d');
    expect(cashfreePlanIdFor('mpl 1/2')).toBe('mpl_1_2');
  });
});

describe('status mapping', () => {
  it('maps every documented subscription status', () => {
    expect(mapSubscriptionStatus('INITIALIZED')).toBe('initialized');
    expect(mapSubscriptionStatus('BANK_APPROVAL_PENDING')).toBe('pending_approval');
    expect(mapSubscriptionStatus('ACTIVE')).toBe('active');
    expect(mapSubscriptionStatus('active')).toBe('active');
    expect(mapSubscriptionStatus('ON_HOLD')).toBe('on_hold');
    expect(mapSubscriptionStatus('PAUSED')).toBe('paused');
    expect(mapSubscriptionStatus('CUSTOMER_PAUSED')).toBe('paused');
    expect(mapSubscriptionStatus('CANCELLED')).toBe('cancelled');
    expect(mapSubscriptionStatus('CUSTOMER_CANCELLED')).toBe('cancelled');
    expect(mapSubscriptionStatus('COMPLETED')).toBe('completed');
    expect(mapSubscriptionStatus('EXPIRED')).toBe('expired');
    expect(mapSubscriptionStatus('LINK_EXPIRED')).toBe('expired');
    expect(mapSubscriptionStatus('CARD_EXPIRED')).toBe('expired');
    expect(mapSubscriptionStatus('SOMETHING_NEW')).toBeNull();
    expect(mapSubscriptionStatus(undefined)).toBeNull();
  });

  it('knows which statuses are terminal', () => {
    expect(isTerminalSubscriptionStatus('cancelled')).toBe(true);
    expect(isTerminalSubscriptionStatus('expired')).toBe(true);
    expect(isTerminalSubscriptionStatus('active')).toBe(false);
    expect(isTerminalSubscriptionStatus('on_hold')).toBe(false);
  });

  it('maps payment statuses', () => {
    expect(mapPaymentStatus('SUCCESS')).toBe('paid');
    expect(mapPaymentStatus('PENDING')).toBe('pending');
    expect(mapPaymentStatus('INITIALIZED')).toBe('pending');
    expect(mapPaymentStatus('FAILED')).toBe('failed');
    expect(mapPaymentStatus('CANCELLED')).toBe('cancelled');
    expect(mapPaymentStatus('NOTIFICATION_SENT')).toBeNull();
  });
});

describe('CashfreeSubscriptionsClient', () => {
  it('uses the sandbox / production PG hosts', () => {
    expect(cashfreeBaseUrl('sandbox')).toBe('https://sandbox.cashfree.com/pg');
    expect(cashfreeBaseUrl('production')).toBe('https://api.cashfree.com/pg');
  });

  it('creates a PERIODIC plan in rupees with auth + version headers', async () => {
    const { client: c, calls } = client([[/POST .*\/pg\/plans$/, 200, { plan_id: 'mpl_1' }]]);
    await c.createPlan({
      planId: 'mpl_1',
      name: 'Monthly unlimited',
      amountPaise: 200000,
      currency: 'INR',
      intervalType: 'MONTH',
      intervals: 1,
      note: '8 classes',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://sandbox.cashfree.com/pg/plans');
    expect(calls[0]!.headers).toMatchObject({
      'x-client-id': 'cf_id',
      'x-client-secret': 'cf_secret',
      'x-api-version': CASHFREE_SUBSCRIPTIONS_API_VERSION,
      'Content-Type': 'application/json',
      'x-idempotency-key': 'plan-mpl_1',
    });
    expect(CASHFREE_SUBSCRIPTIONS_API_VERSION).toBe('2026-01-01');
    expect(calls[0]!.body).toEqual({
      plan_id: 'mpl_1',
      plan_name: 'Monthly unlimited',
      plan_type: 'PERIODIC',
      plan_currency: 'INR',
      plan_recurring_amount: 2000,
      plan_max_amount: 2000,
      plan_intervals: 1,
      plan_interval_type: 'MONTH',
      plan_note: '8 classes',
    });
  });

  it('creates a subscription against an existing plan and returns the session id', async () => {
    const { client: c, calls } = client(
      [
        [
          /POST https:\/\/api\.cashfree\.com\/pg\/subscriptions$/,
          200,
          {
            cf_subscription_id: '23639356',
            subscription_id: 'msub_1',
            subscription_status: 'INITIALIZED',
            subscription_session_id: 'sub_session_abc',
          },
        ],
      ],
      'production',
    );
    const res = await c.createSubscription({
      subscriptionId: 'msub_1',
      planId: 'mpl_1',
      customer: { name: 'Asha', email: 'asha@example.com', phone: '9876543210' },
      returnUrl: 'https://app.example/book/yoga/memberships/return?sub=msub_1',
      tags: { psp_note: 'Monthly · Yoga' },
    });
    expect(res.subscription_session_id).toBe('sub_session_abc');
    expect(calls[0]!.body).toEqual({
      subscription_id: 'msub_1',
      customer_details: {
        customer_name: 'Asha',
        customer_email: 'asha@example.com',
        customer_phone: '9876543210',
      },
      plan_details: { plan_id: 'mpl_1' },
      subscription_meta: {
        return_url: 'https://app.example/book/yoga/memberships/return?sub=msub_1',
      },
      subscription_tags: { psp_note: 'Monthly · Yoga' },
    });
  });

  it('sends vendor splits only when a settlement vendor is provided', async () => {
    const { client: c, calls } = client([[/POST .*\/subscriptions$/, 200, {}]]);
    await c.createSubscription({
      subscriptionId: 'msub_2',
      planId: 'mpl_1',
      customer: { name: 'A', email: 'a@example.com', phone: '9876543210' },
      returnUrl: 'https://x/r',
      splits: [{ vendorId: 'VEND_1', percentage: 100 }],
    });
    expect((calls[0]!.body as Record<string, unknown>).subscription_payment_splits).toEqual([
      { vendor_id: 'VEND_1', percentage: 100 },
    ]);
  });

  it('fetches and cancels via /manage with URL-encoded ids', async () => {
    const { client: c, calls } = client([
      [/GET .*\/subscriptions\/msub_3$/, 200, { subscription_status: 'ACTIVE' }],
      [/POST .*\/subscriptions\/msub_3\/manage$/, 200, { subscription_status: 'CANCELLED' }],
      [/GET .*\/plans\/mpl%2F1$/, 200, { plan_id: 'mpl/1' }],
    ]);
    expect((await c.fetchSubscription('msub_3')).subscription_status).toBe('ACTIVE');
    await c.manageSubscription('msub_3', 'CANCEL');
    await c.fetchPlan('mpl/1');
    expect(calls[0]!.headers['Content-Type']).toBeUndefined();
    expect(calls[1]!.body).toEqual({ subscription_id: 'msub_3', action: 'CANCEL' });
    expect(calls[2]!.url).toBe('https://sandbox.cashfree.com/pg/plans/mpl%2F1');
  });

  it('surfaces Cashfree error code + message', async () => {
    const { client: c } = client([
      [
        /POST .*\/subscriptions$/,
        400,
        { message: 'customer_phone is invalid', code: 'customer_phone_invalid', type: 'invalid' },
      ],
    ]);
    const err = await c
      .createSubscription({
        subscriptionId: 'msub_4',
        planId: 'mpl_1',
        customer: { name: 'A', email: 'a@example.com', phone: '1' },
        returnUrl: 'https://x/r',
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CashfreeApiError);
    expect((err as CashfreeApiError).status).toBe(400);
    expect((err as CashfreeApiError).code).toBe('customer_phone_invalid');
    expect((err as CashfreeApiError).message).toMatch(/\(400\): customer_phone is invalid/);
  });

  it('keeps non-JSON error bodies', async () => {
    const { client: c } = client([[/GET .*/, 502, 'upstream down']]);
    await expect(c.fetchSubscription('x')).rejects.toThrow(/\(502\): upstream down/);
  });
});

// Records insert/update calls; enough of Drizzle's chain for service.ts.
// `tenant` is what a tenant_settings lookup returns (the payout vendor).
function fakeDb(tenant: Record<string, unknown>[] = []) {
  const ops: Array<{ op: 'insert' | 'update'; values: Record<string, unknown> }> = [];
  const db = {
    select: () => ({ from: () => ({ where: async () => tenant }) }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        ops.push({ op: 'insert', values });
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          ops.push({ op: 'update', values });
        },
      }),
    }),
  };
  return { db: db as unknown as Db, ops };
}

const plan = {
  id: 'mpl_1',
  organizationId: 'org_1',
  name: 'Monthly',
  description: null,
  amountCents: 200000,
  currency: 'INR',
  interval: 'month' as const,
  intervalCount: 1,
  sessionsPerCycle: 8,
  active: true,
  cashfreePlanId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('membership orchestration', () => {
  it('treats "plan already exists" as success after confirming the plan', async () => {
    const { client: c, calls } = client([
      [/POST .*\/plans$/, 409, { message: 'plan with id already exists', code: 'plan_exists' }],
      [/GET .*\/plans\/mpl_1$/, 200, { plan_id: 'mpl_1' }],
    ]);
    const { db, ops } = fakeDb();
    await expect(ensureCashfreePlan(db, c, plan)).resolves.toBe('mpl_1');
    expect(calls.map((x) => x.method)).toEqual(['POST', 'GET']);
    expect(ops).toEqual([
      { op: 'update', values: expect.objectContaining({ cashfreePlanId: 'mpl_1' }) },
    ]);
  });

  it('skips Cashfree when the plan id is already stored', async () => {
    const { client: c, calls } = client([]);
    const { db } = fakeDb();
    await expect(ensureCashfreePlan(db, c, { ...plan, cashfreePlanId: 'cf_p' })).resolves.toBe(
      'cf_p',
    );
    expect(calls).toHaveLength(0);
  });

  it('writes the row before calling Cashfree and returns the authorization link', async () => {
    const { client: c, calls } = client([
      [/POST .*\/plans$/, 200, {}],
      [
        /POST .*\/subscriptions$/,
        200,
        { subscription_session_id: 'sess_1', subscription_status: 'INITIALIZED' },
      ],
    ]);
    const { db, ops } = fakeDb();
    const res = await startSubscription(db, c, {
      org: { id: 'org_1', slug: 'yoga', name: 'Yoga Co' },
      plan,
      customer: { id: 'cus_1', name: 'Asha', email: 'a@example.com', phone: '9876543210' },
      appUrl: 'https://app.example',
    });
    expect(ops[0]).toMatchObject({ op: 'insert', values: { status: 'initialized' } });
    expect(res.authorizationUrl).toBe(
      `https://app.example/book/yoga/memberships/authorize?sub=${res.subscriptionId}`,
    );
    const subBody = calls[1]!.body as Record<string, unknown>;
    expect(subBody.subscription_id).toBe(res.subscriptionId);
    expect(subBody.subscription_payment_splits).toBeUndefined();
    expect(ops.at(-1)).toMatchObject({
      op: 'update',
      values: { cashfreeSessionId: 'sess_1', status: 'initialized' },
    });
  });

  it("splits to the tenant's ACTIVE Easy Split vendor", async () => {
    const { client: c, calls } = client([
      [/POST .*\/plans$/, 200, {}],
      [
        /POST .*\/subscriptions$/,
        200,
        { subscription_session_id: 's', subscription_status: 'INITIALIZED' },
      ],
    ]);
    const args = {
      org: { id: 'org_1', slug: 'yoga', name: 'Yoga Co' },
      plan,
      customer: { id: 'cus_1', name: 'Asha', email: 'a@example.com', phone: '9876543210' },
      appUrl: 'https://app.example',
    };
    await startSubscription(fakeDb([{ vendorId: 'uf_org_1', status: 'ACTIVE' }]).db, c, args);
    expect((calls[1]!.body as Record<string, unknown>).subscription_payment_splits).toEqual([
      { vendor_id: 'uf_org_1', percentage: 100 },
    ]);
    // A vendor still in bank verification doesn't get splits yet.
    await startSubscription(
      fakeDb([{ vendorId: 'uf_org_1', status: 'IN_BANK_VERIFICATION' }]).db,
      c,
      args,
    );
    expect((calls[3]!.body as Record<string, unknown>).subscription_payment_splits).toBeUndefined();
  });

  it('marks the row failed when Cashfree rejects the subscription', async () => {
    const { client: c } = client([
      [/POST .*\/plans$/, 200, {}],
      [/POST .*\/subscriptions$/, 400, { message: 'bad', code: 'x' }],
    ]);
    const { db, ops } = fakeDb();
    await expect(
      startSubscription(db, c, {
        org: { id: 'org_1', slug: 'yoga', name: 'Yoga Co' },
        plan,
        customer: { id: 'cus_1', name: 'Asha', email: 'a@example.com', phone: '9876543210' },
        appUrl: 'https://app.example',
      }),
    ).rejects.toBeInstanceOf(CashfreeApiError);
    expect(ops.at(-1)).toMatchObject({ op: 'update', values: { status: 'failed' } });
  });
});

// insert…onConflictDoNothing…returning / update…returning, with the
// conflict + update outcome scripted per test.
function paymentDb(opts: { conflict: boolean; updated: boolean }) {
  const ops: Array<{ op: string; values: Record<string, unknown> }> = [];
  const db = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            ops.push({ op: 'insert', values });
            return opts.conflict ? [] : [{ id: values.id }];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            ops.push({ op: 'update', values });
            return opts.updated ? [{ id: 'mpay_x' }] : [];
          },
        }),
      }),
    }),
  };
  return { db: db as unknown as Db, ops };
}

describe('recordPayment', () => {
  const row = { id: 'msub_1', organizationId: 'org_1' } as Parameters<typeof recordPayment>[1];
  const success = {
    key: 'cfpay_1',
    paymentType: 'CHARGE',
    amount: '2000.00',
    status: 'SUCCESS',
    failureReason: null,
  };

  it('inserts a new debit in paise, keyed on the Cashfree payment id', async () => {
    const { db, ops } = paymentDb({ conflict: false, updated: false });
    await expect(recordPayment(db, row, success, 1)).resolves.toBe('inserted');
    expect(ops[0]!.values).toMatchObject({
      cashfreePaymentId: 'cfpay_1',
      amountCents: 200000,
      status: 'paid',
      subscriptionId: 'msub_1',
    });
    expect(ops[0]!.values.paidAt).toBeInstanceOf(Date);
  });

  it('falls back to the plan amount when the event has none', async () => {
    const { db, ops } = paymentDb({ conflict: false, updated: false });
    await recordPayment(db, row, { ...success, amount: null }, 150000);
    expect(ops[0]!.values.amountCents).toBe(150000);
  });

  it('is a no-op for a duplicate delivery that cannot move the status forward', async () => {
    const { db, ops } = paymentDb({ conflict: true, updated: false });
    await expect(recordPayment(db, row, success, 1)).resolves.toBe('ignored');
    expect(ops.map((o) => o.op)).toEqual(['insert', 'update']);
  });

  it('upgrades an existing row (e.g. UPI retry succeeding after a failure)', async () => {
    const { db, ops } = paymentDb({ conflict: true, updated: true });
    await expect(recordPayment(db, row, success, 1)).resolves.toBe('updated');
    expect(ops[1]!.values).toMatchObject({ status: 'paid' });
  });

  it('never downgrades on a repeated pending event and ignores unknown statuses', async () => {
    const pending = paymentDb({ conflict: true, updated: true });
    await expect(
      recordPayment(pending.db, row, { ...success, status: 'PENDING' }, 1),
    ).resolves.toBe('ignored');
    expect(pending.ops.map((o) => o.op)).toEqual(['insert']);
    const unknown = paymentDb({ conflict: false, updated: false });
    await expect(
      recordPayment(unknown.db, row, { ...success, status: 'WHO_KNOWS' }, 1),
    ).resolves.toBe('ignored');
    expect(unknown.ops).toHaveLength(0);
  });
});

describe('webhook signature', () => {
  const secret = 'cf_secret';
  const body = '{"type":"SUBSCRIPTION_STATUS_CHANGED","data":{}}';
  const ts = '1727700000000';
  const sig = createHmac('sha256', secret)
    .update(ts + body)
    .digest('base64');

  it('accepts a valid signature', () => {
    expect(verifyCashfreeSignature({ secret, signature: sig, timestamp: ts, rawBody: body })).toBe(
      true,
    );
  });

  it('rejects tampered body, timestamp, secret or missing headers', () => {
    expect(
      verifyCashfreeSignature({ secret, signature: sig, timestamp: ts, rawBody: `${body} ` }),
    ).toBe(false);
    expect(verifyCashfreeSignature({ secret, signature: sig, timestamp: '1', rawBody: body })).toBe(
      false,
    );
    expect(
      verifyCashfreeSignature({ secret: 'other', signature: sig, timestamp: ts, rawBody: body }),
    ).toBe(false);
    expect(verifyCashfreeSignature({ secret, signature: null, timestamp: ts, rawBody: body })).toBe(
      false,
    );
    expect(
      verifyCashfreeSignature({ secret, signature: 'short', timestamp: ts, rawBody: body }),
    ).toBe(false);
  });
});

describe('webhook payload parsing', () => {
  it('parses the published SUBSCRIPTION_STATUS_CHANGED sample', () => {
    const e = parseSubscriptionWebhook(
      JSON.stringify({
        data: {
          subscription_details: {
            cf_subscription_id: '23639356',
            subscription_id: 'msub_1',
            subscription_status: 'ACTIVE',
            subscription_expiry_time: '2055-08-07T10:30:46',
            next_schedule_date: '2026-10-30T10:30:46',
          },
          customer_details: { customer_email: 'john@dummy.com', customer_phone: '9900000000' },
          plan_details: { plan_id: 'mpl_1', plan_type: 'PERIODIC', plan_max_amount: 399.0 },
          authorization_details: {
            authorization_amount: 2.0,
            authorization_status: 'SUCCESS',
            payment_group: 'upi',
          },
        },
        event_time: '2026-09-30T10:30:46',
        type: 'SUBSCRIPTION_STATUS_CHANGED',
      }),
    );
    expect(e).toEqual({
      type: 'SUBSCRIPTION_STATUS_CHANGED',
      subscriptionId: 'msub_1',
      cfSubscriptionId: '23639356',
      subscriptionStatus: 'ACTIVE',
      nextScheduleDate: '2026-10-30T10:30:46',
      authorizationStatus: 'SUCCESS',
      payment: null,
    });
  });

  it('parses a flat payment event (SubscriptionPaymentEntity shape)', () => {
    const e = parseSubscriptionWebhook(
      JSON.stringify({
        type: 'SUBSCRIPTION_PAYMENT_SUCCESS',
        data: {
          subscription_id: 'msub_1',
          cf_subscription_id: 23639356,
          payment_id: 'pay_1',
          cf_payment_id: 998877,
          payment_type: 'CHARGE',
          payment_amount: 2000,
          payment_status: 'SUCCESS',
        },
      }),
    );
    expect(e?.subscriptionId).toBe('msub_1');
    expect(e?.cfSubscriptionId).toBe('23639356');
    expect(e?.subscriptionStatus).toBeNull();
    expect(e?.payment).toEqual({
      key: '998877',
      paymentType: 'CHARGE',
      amount: 2000,
      status: 'SUCCESS',
      failureReason: null,
    });
  });

  it('parses a nested payment event with failure details', () => {
    const e = parseSubscriptionWebhook(
      JSON.stringify({
        type: 'SUBSCRIPTION_PAYMENT_FAILED',
        data: {
          payment_details: {
            subscription_id: 'msub_1',
            payment_id: 'pay_2',
            payment_type: 'CHARGE',
            payment_amount: '2000.00',
            payment_status: 'FAILED',
            failure_details: { failure_reason: 'Insufficient funds' },
          },
        },
      }),
    );
    expect(e?.subscriptionId).toBe('msub_1');
    expect(e?.payment).toMatchObject({
      key: 'pay_2',
      amount: '2000.00',
      status: 'FAILED',
      failureReason: 'Insufficient funds',
    });
  });

  it('does not treat non-payment events as payments and rejects garbage', () => {
    const e = parseSubscriptionWebhook(
      JSON.stringify({
        type: 'SUBSCRIPTION_AUTH_STATUS',
        data: { subscription_id: 'msub_1', payment_id: 'auth_1', payment_type: 'AUTH' },
      }),
    );
    expect(e?.payment).toBeNull();
    expect(e?.subscriptionId).toBe('msub_1');
    expect(parseSubscriptionWebhook('not json')).toBeNull();
    expect(parseSubscriptionWebhook('[]')).toBeNull();
    expect(parseSubscriptionWebhook('{}')?.type).toBe('UNKNOWN');
  });
});
