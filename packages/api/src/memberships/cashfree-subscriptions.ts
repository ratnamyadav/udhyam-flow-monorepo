// Minimal Cashfree Subscriptions client (plans, subscriptions, manage).
//
// Endpoints, headers and field names mirror the official `cashfree-pg`
// Node SDK v6.0.6 (`subsCreatePlan`, `subsFetchPlan`,
// `subsCreateSubscription`, `subsFetchSubscription`,
// `subsManageSubscription`), which targets x-api-version 2026-01-01 under
// https://{sandbox,api}.cashfree.com/pg. We call them with plain `fetch`
// (injectable for tests) instead of depending on the SDK, which pulls in
// axios and a Sentry client that phones home by default.
//
// Amounts on the wire are decimal rupees; callers pass paise and we convert.

import { paiseToRupees } from './status';

export const CASHFREE_SUBSCRIPTIONS_API_VERSION = '2026-01-01';

export type CashfreeEnv = 'sandbox' | 'production';

export function cashfreeBaseUrl(env: CashfreeEnv): string {
  return env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

export class CashfreeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly body: string,
  ) {
    super(message);
    this.name = 'CashfreeApiError';
  }
}

// --- Wire types (subset of the SDK's PlanEntity / SubscriptionEntity) ---

export type CashfreePlan = {
  plan_id?: string;
  plan_name?: string;
  plan_type?: string;
  plan_currency?: string;
  plan_recurring_amount?: number;
  plan_max_amount?: number;
  plan_intervals?: number;
  plan_interval_type?: string;
  plan_status?: string;
};

export type CashfreeSubscription = {
  cf_subscription_id?: string;
  subscription_id?: string;
  subscription_status?: string;
  subscription_session_id?: string;
  subscription_first_charge_time?: string | null;
  subscription_expiry_time?: string | null;
  next_schedule_date?: string | null;
  authorisation_details?: {
    authorization_status?: string;
    authorization_time?: string | null;
    authorization_reference?: string;
    payment_group?: string;
  } | null;
  plan_details?: CashfreePlan;
};

export type CreatePlanInput = {
  planId: string;
  name: string;
  amountPaise: number;
  currency: string;
  intervalType: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  intervals: number;
  note?: string;
};

export type CreateSubscriptionInput = {
  subscriptionId: string;
  planId: string;
  customer: { name: string; email: string; phone: string };
  returnUrl: string;
  // Easy Split vendor routing (SDK: `subscription_payment_splits`).
  splits?: Array<{ vendorId: string; percentage: number }>;
  tags?: Record<string, string>;
};

export type ManageAction = 'CANCEL' | 'PAUSE' | 'ACTIVATE';

type FetchLike = typeof fetch;

export class CashfreeSubscriptionsClient {
  private readonly base: string;
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly opts: {
      clientId: string;
      clientSecret: string;
      env: CashfreeEnv;
      fetch?: FetchLike;
    },
  ) {
    this.base = cashfreeBaseUrl(opts.env);
    this.fetchImpl = opts.fetch ?? fetch;
  }

  get env(): CashfreeEnv {
    return this.opts.env;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'x-client-id': this.opts.clientId,
      'x-client-secret': this.opts.clientSecret,
      'x-api-version': CASHFREE_SUBSCRIPTIONS_API_VERSION,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;

    const res = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      // Cashfree errors look like { message, code, type }.
      let code: string | null = null;
      let message = text.slice(0, 300) || res.statusText;
      try {
        const parsed = JSON.parse(text) as { message?: string; code?: string };
        code = parsed.code ?? null;
        if (parsed.message) message = parsed.message;
      } catch {
        // non-JSON error body — keep the raw text
      }
      throw new CashfreeApiError(
        res.status,
        code,
        `Cashfree ${method} ${path} failed (${res.status}): ${message}`,
        text,
      );
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  createPlan(input: CreatePlanInput): Promise<CashfreePlan> {
    const amount = paiseToRupees(input.amountPaise);
    return this.request<CashfreePlan>(
      'POST',
      '/plans',
      {
        plan_id: input.planId,
        plan_name: input.name.slice(0, 100),
        plan_type: 'PERIODIC',
        plan_currency: input.currency,
        plan_recurring_amount: amount,
        // Mandate ceiling. Equal to the recurring amount: the customer
        // approves exactly what they'll be charged.
        plan_max_amount: amount,
        plan_intervals: input.intervals,
        plan_interval_type: input.intervalType,
        ...(input.note ? { plan_note: input.note.slice(0, 500) } : {}),
      },
      `plan-${input.planId}`,
    );
  }

  fetchPlan(planId: string): Promise<CashfreePlan> {
    return this.request<CashfreePlan>('GET', `/plans/${encodeURIComponent(planId)}`);
  }

  createSubscription(input: CreateSubscriptionInput): Promise<CashfreeSubscription> {
    return this.request<CashfreeSubscription>(
      'POST',
      '/subscriptions',
      {
        subscription_id: input.subscriptionId,
        customer_details: {
          customer_name: input.customer.name,
          customer_email: input.customer.email,
          customer_phone: input.customer.phone,
        },
        plan_details: { plan_id: input.planId },
        subscription_meta: { return_url: input.returnUrl },
        ...(input.tags ? { subscription_tags: input.tags } : {}),
        ...(input.splits && input.splits.length > 0
          ? {
              subscription_payment_splits: input.splits.map((s) => ({
                vendor_id: s.vendorId,
                percentage: s.percentage,
              })),
            }
          : {}),
      },
      `sub-${input.subscriptionId}`,
    );
  }

  fetchSubscription(subscriptionId: string): Promise<CashfreeSubscription> {
    return this.request<CashfreeSubscription>(
      'GET',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  manageSubscription(subscriptionId: string, action: ManageAction): Promise<CashfreeSubscription> {
    return this.request<CashfreeSubscription>(
      'POST',
      `/subscriptions/${encodeURIComponent(subscriptionId)}/manage`,
      { subscription_id: subscriptionId, action },
    );
  }
}

// Platform-level credentials, same as the one-off Cashfree checkout in
// router/payment.ts. Returns null when Cashfree isn't configured.
export function cashfreeSubscriptionsFromEnv(
  fetchImpl?: FetchLike,
): CashfreeSubscriptionsClient | null {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const env: CashfreeEnv = process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';
  return new CashfreeSubscriptionsClient({ clientId, clientSecret, env, fetch: fetchImpl });
}
