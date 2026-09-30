// Cashfree Subscriptions webhooks: signature check + payload normalisation.
//
// Signature scheme is the same as Cashfree PG webhooks (and the SDK's
// `PGVerifyWebhookSignature`):
//   x-webhook-signature = base64(HMAC-SHA256(client secret, x-webhook-timestamp + rawBody))
//
// Payload shapes: SUBSCRIPTION_STATUS_CHANGED nests the subscription under
// `data.subscription_details` (confirmed from Cashfree's published sample).
// Payment / auth events (SUBSCRIPTION_PAYMENT_SUCCESS|FAILED|CANCELLED,
// SUBSCRIPTION_AUTH_STATUS) weren't available to verify, so we accept the
// fields either flat on `data` (the SubscriptionPaymentEntity shape the API
// returns) or nested under `data.payment_details` / `data.payment`.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyCashfreeSignature(args: {
  secret: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
}): boolean {
  if (!args.signature || !args.timestamp) return false;
  const expected = createHmac('sha256', args.secret)
    .update(args.timestamp + args.rawBody)
    .digest('base64');
  const sigBuf = Buffer.from(args.signature);
  const expBuf = Buffer.from(expected);
  return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
}

export type SubscriptionWebhookPayment = {
  // cf_payment_id, falling back to the merchant payment_id.
  key: string;
  paymentType: string | null; // AUTH | CHARGE
  amount: number | string | null; // rupees
  status: string | null; // raw Cashfree payment_status
  failureReason: string | null;
};

export type SubscriptionWebhookEvent = {
  type: string;
  subscriptionId: string | null; // merchant subscription_id
  cfSubscriptionId: string | null;
  subscriptionStatus: string | null; // raw Cashfree subscription_status
  nextScheduleDate: string | null;
  authorizationStatus: string | null;
  payment: SubscriptionWebhookPayment | null;
};

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function first(...vals: unknown[]): string | null {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return null;
}

export function parseSubscriptionWebhook(rawBody: string): SubscriptionWebhookEvent | null {
  let root: Obj | null;
  try {
    root = obj(JSON.parse(rawBody));
  } catch {
    return null;
  }
  if (!root) return null;
  const type = str(root.type) ?? str(root.event) ?? 'UNKNOWN';
  const data = obj(root.data) ?? {};
  const sub = obj(data.subscription_details) ?? obj(data.subscription) ?? {};
  const payNested = obj(data.payment_details) ?? obj(data.payment);
  const pay = payNested ?? data;
  const auth =
    obj(data.authorization_details) ??
    obj(data.authorisation_details) ??
    obj(pay.authorization_details) ??
    null;

  const subscriptionId = first(sub.subscription_id, pay.subscription_id, data.subscription_id);
  const cfSubscriptionId = first(
    sub.cf_subscription_id,
    pay.cf_subscription_id,
    data.cf_subscription_id,
  );

  let payment: SubscriptionWebhookPayment | null = null;
  const paymentKey = first(pay.cf_payment_id, pay.payment_id);
  if (type.includes('PAYMENT') && paymentKey) {
    const failure = obj(pay.failure_details);
    const rawAmount = pay.payment_amount;
    payment = {
      key: paymentKey,
      paymentType: str(pay.payment_type),
      amount: typeof rawAmount === 'number' || typeof rawAmount === 'string' ? rawAmount : null,
      status: str(pay.payment_status),
      failureReason: first(failure?.failure_reason, pay.failure_reason),
    };
  }

  return {
    type,
    subscriptionId,
    cfSubscriptionId,
    subscriptionStatus: first(sub.subscription_status, data.subscription_status),
    nextScheduleDate: first(sub.next_schedule_date, data.next_schedule_date),
    authorizationStatus: first(auth?.authorization_status),
    payment,
  };
}
