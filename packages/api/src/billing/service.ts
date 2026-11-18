import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, schema } from '@udyamflow/db';
import { and, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import {
  CashfreeApiError,
  cashfreeSubscriptionsFromEnv,
} from '../memberships/cashfree-subscriptions';
import { cycleEnd, utcTimestamp } from '../memberships/credits';
import { mapSubscriptionStatus, parseCashfreeTime } from '../memberships/status';
import type { SubscriptionWebhookEvent } from '../memberships/webhook';
import { APP_URL, getStripe } from '../payments/providers';

export const BILLING_PRICES = { INR: 29_900, USD: 1_000 } as const;
type Subscription = typeof schema.locationSubscription.$inferSelect;
export const trialEnd = (createdAt: Date) => cycleEnd(createdAt, 'month', 6);

// A Stripe checkout attempt for a billing row starts at `row.createdAt`: the
// session expires at createdAt + CHECKOUT_MS and the idempotency key is
// derived from it, so concurrent callers for the same attempt get the same
// session. Stripe rejects expires_at < 30 min after creation, so a retry
// after a failed attempt restarts the clock instead of reusing it.
const CHECKOUT_MS = 31 * 60_000;
const CHECKOUT_RESTART_MS = 30_000;

// Renewals are confirmed by provider webhooks some time after the period
// ends (Stripe finalizes renewal invoices ~1h late and retries failures;
// Cashfree debits settle hours to days later). Renewing subscriptions keep
// access this long past `paidUntil` so locations don't go dark meanwhile.
export const BILLING_GRACE_MS = 3 * 24 * 60 * 60_000;

// Statuses that are still expected to renew, and so earn the grace period.
// Cancelled/expired rows keep access only until `paidUntil`.
const RENEWING: ReadonlySet<Subscription['status']> = new Set(['active', 'past_due']);

export type BillingAccess = {
  // trial: free period; paid: inside a paid period; grace: renewal overdue
  // but still accepting bookings; none: bookings paused.
  state: 'trial' | 'paid' | 'grace' | 'none';
  // End of the paid (or free) period, ignoring grace.
  paidUntil: Date;
  // When new bookings pause. Null once they have.
  accessUntil: Date | null;
};

// Pure access rule shared by the booking gate and the billing page. The
// trial counts as the first paid period: a location with a renewing
// subscription gets the grace after trial end too (covering the first
// charge), but a location with no subscription stops at trial end.
export function billingAccessFor(
  trialUntil: Date,
  subscriptions: Pick<Subscription, 'status' | 'paidUntil'>[],
  now = new Date(),
): BillingAccess {
  let paid = trialUntil.getTime();
  let grace = Number.NEGATIVE_INFINITY;
  for (const sub of subscriptions) {
    const subPaid = sub.paidUntil?.getTime() ?? Number.NEGATIVE_INFINITY;
    paid = Math.max(paid, subPaid);
    if (RENEWING.has(sub.status))
      grace = Math.max(grace, Math.max(subPaid, trialUntil.getTime()) + BILLING_GRACE_MS);
  }
  const t = now.getTime();
  const accessUntil = Math.max(paid, grace);
  const paidUntil = new Date(paid);
  if (t >= accessUntil) return { state: 'none', paidUntil, accessUntil: null };
  return {
    state: t < trialUntil.getTime() ? 'trial' : t < paid ? 'paid' : 'grace',
    paidUntil,
    accessUntil: new Date(accessUntil),
  };
}

export async function locationBillingAccess(
  db: Db,
  orgId: string,
  locationId: string,
  now = new Date(),
) {
  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, orgId));
  if (!org) return false;
  const trialUntil = trialEnd(org.createdAt);
  if (trialUntil > now) return true;
  const subscriptions = await db
    .select({
      status: schema.locationSubscription.status,
      paidUntil: schema.locationSubscription.paidUntil,
    })
    .from(schema.locationSubscription)
    .where(
      and(
        eq(schema.locationSubscription.organizationId, orgId),
        eq(schema.locationSubscription.locationId, locationId),
      ),
    );
  return billingAccessFor(trialUntil, subscriptions, now).state !== 'none';
}

export async function startLocationSubscription(
  db: Db,
  args: {
    orgId: string;
    locationId: string;
    customer: { name: string; email: string; phone?: string };
  },
) {
  const [location] = await db
    .select()
    .from(schema.location)
    .where(
      and(
        eq(schema.location.id, args.locationId),
        eq(schema.location.organizationId, args.orgId),
        isNull(schema.location.archivedAt),
      ),
    );
  if (!location) throw new TRPCError({ code: 'NOT_FOUND' });
  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, args.orgId));
  const freeUntil = org ? trialEnd(org.createdAt) : new Date();
  if (freeUntil > new Date() && freeUntil.getTime() <= Date.now() + 48 * 60 * 60_000)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Your trial is still active until ${freeUntil.toISOString().slice(0, 10)}. Set up billing when it ends to avoid an early charge.`,
    });
  const [paidCancelled] = await db
    .select()
    .from(schema.locationSubscription)
    .where(
      and(
        eq(schema.locationSubscription.locationId, location.id),
        eq(schema.locationSubscription.status, 'cancelled'),
        gt(schema.locationSubscription.paidUntil, new Date()),
      ),
    );
  if (paidCancelled)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Paid access is still active. Start a new subscription after the current paid period ends.',
    });
  const trial = freeUntil.getTime() > Date.now() + 48 * 60 * 60_000 ? freeUntil : null;
  const currency = location.currency === 'INR' ? 'INR' : 'USD';
  const provider = currency === 'INR' ? 'cashfree' : 'stripe';
  const amountCents = BILLING_PRICES[currency];
  let [row] = await db
    .select()
    .from(schema.locationSubscription)
    .where(
      and(
        eq(schema.locationSubscription.locationId, location.id),
        inArray(schema.locationSubscription.status, [
          'initializing',
          'pending',
          'active',
          'past_due',
        ]),
      ),
    );
  if (row?.status === 'active' || row?.status === 'past_due')
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This location already has a subscription. Manage or cancel it first.',
    });
  if (row?.provider === 'stripe' && row.createdAt.getTime() + CHECKOUT_MS < Date.now()) {
    // The checkout attempt's fixed expiry (createdAt + CHECKOUT_MS) elapsed;
    // a new session can safely replace it.
    await db
      .update(schema.locationSubscription)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(schema.locationSubscription.id, row.id),
          inArray(schema.locationSubscription.status, ['initializing', 'pending']),
        ),
      );
    row = undefined;
  }
  if (!row) {
    await db
      .insert(schema.locationSubscription)
      .values({
        id: `bill_${randomUUID()}`,
        organizationId: args.orgId,
        locationId: location.id,
        provider,
        amountCents,
        currency,
      })
      .onConflictDoNothing();
    [row] = await db
      .select()
      .from(schema.locationSubscription)
      .where(
        and(
          eq(schema.locationSubscription.locationId, location.id),
          inArray(schema.locationSubscription.status, [
            'initializing',
            'pending',
            'active',
            'past_due',
          ]),
        ),
      );
  }
  if (!row)
    throw new TRPCError({ code: 'CONFLICT', message: 'Billing was updated. Please try again.' });
  if (row.checkoutUrl) return { url: row.checkoutUrl };
  if (row.provider === 'stripe') {
    const stripe = getStripe();
    if (!stripe)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Platform billing is not configured. Contact support.',
      });
    const url = await openStripeCheckout(db, stripe, row, (attemptAt) => ({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: row.currency.toLowerCase(),
            unit_amount: row.amountCents,
            recurring: { interval: 'month' },
            product_data: { name: `UdyamFlow · ${location.name}` },
          },
        },
      ],
      customer_email: args.customer.email,
      metadata: { billingId: row.id },
      subscription_data: {
        metadata: { billingId: row.id },
        ...(trial ? { trial_end: Math.floor(trial.getTime() / 1000) } : {}),
      },
      expires_at: Math.floor((attemptAt.getTime() + CHECKOUT_MS) / 1000),
      success_url: `${APP_URL}/settings/billing?returned=${row.id}`,
      cancel_url: `${APP_URL}/settings/billing`,
    }));
    return { url };
  }
  const client = cashfreeSubscriptionsFromEnv();
  if (!client)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Platform billing is not configured. Contact support.',
    });
  if (!args.customer.phone)
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'An Indian mobile number is required to authorize billing.',
    });
  const planId = 'uf_location_inr_299_monthly_v1';
  try {
    await client.createPlan({
      planId,
      name: 'UdyamFlow location',
      amountPaise: BILLING_PRICES.INR,
      currency: 'INR',
      intervalType: 'MONTH',
      intervals: 1,
    });
  } catch (err) {
    if (
      !(err instanceof CashfreeApiError) ||
      !(err.status === 409 || /already|exist|duplicate/i.test(err.message))
    )
      throw err;
    await client.fetchPlan(planId);
  }
  // Merchant-chosen subscription ID is stable across timeouts and retries.
  const subscription = await client.createSubscription({
    subscriptionId: row.id,
    planId,
    customer: { ...args.customer, phone: args.customer.phone },
    firstChargeAt: trial ?? undefined,
    returnUrl: `${APP_URL}/settings/billing?returned=${row.id}`,
    tags: { billing_id: row.id, location_id: location.id },
  });
  if (!subscription.subscription_session_id)
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: 'Billing authorization is not available. Please retry.',
    });
  const url = `${APP_URL}/settings/billing/authorize/${row.id}`;
  await db
    .update(schema.locationSubscription)
    .set({
      providerId: row.id,
      checkoutId: subscription.subscription_session_id,
      checkoutUrl: url,
      status: 'pending',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.locationSubscription.id, row.id),
        inArray(schema.locationSubscription.status, ['initializing', 'pending']),
      ),
    );
  return { url };
}

type StripeCheckoutParams = Stripe.Checkout.SessionCreateParams;
const checkoutKey = (row: Subscription, attemptAt: Date) => `${row.id}:${attemptAt.getTime()}`;
const stripeErrorType = (err: unknown) =>
  err && typeof err === 'object' && 'type' in err ? String(err.type) : null;

async function openStripeCheckout(
  db: Db,
  stripe: Stripe,
  row: Subscription,
  params: (attemptAt: Date) => StripeCheckoutParams,
): Promise<string> {
  let attemptAt = row.createdAt;
  let session: Stripe.Checkout.Session | null = null;
  if (Date.now() - attemptAt.getTime() > CHECKOUT_RESTART_MS) {
    // An earlier attempt never saved a session. If Stripe did create one
    // (lost response), the idempotent replay returns it, so we never open a
    // second payable session for the same row.
    try {
      const replay = await stripe.checkout.sessions.create(params(attemptAt), {
        idempotencyKey: checkoutKey(row, attemptAt),
      });
      if (replay.status === 'complete') {
        await saveCheckout(db, row, replay.id, null);
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This checkout was already completed. Refresh billing to update its status.',
        });
      }
      if (replay.status === 'open') session = replay;
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      // Only a rejected request (e.g. the stale expires_at) proves no session
      // exists for this attempt; anything else might hide a live one.
      if (stripeErrorType(err) !== 'StripeInvalidRequestError')
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Billing checkout is still being prepared. Try again in a few minutes.',
          cause: err,
        });
    }
    if (!session) {
      // Restart the attempt clock. Conditional, so concurrent retries agree
      // on a single new attempt.
      const restartedAt = new Date();
      await db
        .update(schema.locationSubscription)
        .set({ createdAt: restartedAt, updatedAt: restartedAt })
        .where(
          and(
            eq(schema.locationSubscription.id, row.id),
            isNull(schema.locationSubscription.checkoutUrl),
            inArray(schema.locationSubscription.status, ['initializing', 'pending']),
            lt(
              schema.locationSubscription.createdAt,
              new Date(restartedAt.getTime() - CHECKOUT_RESTART_MS),
            ),
          ),
        );
      const [current] = await db
        .select()
        .from(schema.locationSubscription)
        .where(eq(schema.locationSubscription.id, row.id));
      if (current?.checkoutUrl) return current.checkoutUrl;
      if (!current || (current.status !== 'initializing' && current.status !== 'pending'))
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Billing was updated. Please try again.',
        });
      attemptAt = current.createdAt;
    }
  }
  session ??= await stripe.checkout.sessions.create(params(attemptAt), {
    idempotencyKey: checkoutKey(row, attemptAt),
  });
  if (!session.url)
    throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Billing checkout could not open.' });
  await saveCheckout(db, row, session.id, session.url);
  return session.url;
}

async function saveCheckout(db: Db, row: Subscription, id: string, url: string | null) {
  await db
    .update(schema.locationSubscription)
    .set({ checkoutId: id, checkoutUrl: url, status: 'pending', updatedAt: new Date() })
    .where(
      and(
        eq(schema.locationSubscription.id, row.id),
        inArray(schema.locationSubscription.status, ['initializing', 'pending']),
      ),
    );
}

export async function cancelLocationSubscription(db: Db, row: Subscription) {
  if (row.status === 'cancelled' || row.status === 'expired') return;
  if (row.provider === 'stripe') {
    const stripe = getStripe();
    if (!stripe)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Stripe is not configured.' });
    if (row.providerId)
      await stripe.subscriptions.update(
        row.providerId,
        { cancel_at_period_end: true },
        { idempotencyKey: `cancel-${row.id}` },
      );
    else if (row.checkoutId)
      await stripe.checkout.sessions.expire(row.checkoutId).catch((err) => {
        throw new TRPCError({
          code: 'BAD_GATEWAY',
          message: 'Could not cancel pending billing. Refresh and try again.',
          cause: err,
        });
      });
  } else if (row.providerId || row.checkoutId) {
    const client = cashfreeSubscriptionsFromEnv();
    if (!client)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Cashfree is not configured.' });
    await client.manageSubscription(row.id, 'CANCEL');
  }
  await db
    .update(schema.locationSubscription)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(schema.locationSubscription.id, row.id));
}

export async function syncStripeBilling(db: Db, subscription: Stripe.Subscription, eventAt: Date) {
  const billingId = subscription.metadata.billingId;
  if (!billingId) return false;
  const [row] = await db
    .select()
    .from(schema.locationSubscription)
    .where(eq(schema.locationSubscription.id, billingId));
  if (!row || row.provider !== 'stripe' || (row.providerId && row.providerId !== subscription.id))
    return false;
  const status: Subscription['status'] =
    subscription.status === 'canceled'
      ? 'cancelled'
      : subscription.cancel_at_period_end
        ? 'cancelled'
        : subscription.status === 'active' || subscription.status === 'trialing'
          ? 'active'
          : subscription.status === 'incomplete_expired'
            ? 'expired'
            : subscription.status === 'past_due' || subscription.status === 'unpaid'
              ? 'past_due'
              : 'pending';
  await db
    .update(schema.locationSubscription)
    .set({ providerId: subscription.id, status, lastEventAt: eventAt, updatedAt: new Date() })
    .where(
      and(
        eq(schema.locationSubscription.id, row.id),
        or(isNull(schema.locationSubscription.lastEventAt), lteEvent(eventAt)),
      ),
    );
  return true;
}
function lteEvent(at: Date) {
  return sql`${schema.locationSubscription.lastEventAt} <= ${utcTimestamp(at)}`;
}

export async function recordStripeBillingPayment(db: Db, invoice: Stripe.Invoice) {
  const parent = invoice.parent?.subscription_details;
  const subscriptionId =
    typeof parent?.subscription === 'string' ? parent.subscription : parent?.subscription?.id;
  const billingId = parent?.metadata?.billingId;
  const [row] = await db
    .select()
    .from(schema.locationSubscription)
    .where(
      billingId
        ? eq(schema.locationSubscription.id, billingId)
        : and(
            eq(schema.locationSubscription.provider, 'stripe'),
            eq(schema.locationSubscription.providerId, subscriptionId ?? ''),
          ),
    );
  if (
    !row ||
    invoice.status !== 'paid' ||
    invoice.amount_paid < row.amountCents ||
    invoice.currency.toUpperCase() !== row.currency
  )
    return false;
  const end = Math.max(...invoice.lines.data.map((line) => line.period.end));
  if (!Number.isFinite(end)) return false;
  await db
    .insert(schema.billingPayment)
    .values({
      id: `bpay_${randomUUID()}`,
      subscriptionId: row.id,
      providerPaymentId: invoice.id,
      paidAt: new Date(),
      paidUntil: new Date(end * 1000),
    })
    .onConflictDoNothing();
  await db
    .update(schema.locationSubscription)
    .set({
      providerId: subscriptionId,
      paidUntil: sql`greatest(coalesce(${schema.locationSubscription.paidUntil}, '1970-01-01'::timestamp), ${utcTimestamp(new Date(end * 1000))})`,
      updatedAt: new Date(),
    })
    .where(eq(schema.locationSubscription.id, row.id));
  return true;
}

// Without a first-charge time, Cashfree schedules the first debit at the
// earliest feasible date after authorization (T+1 for UPI/cards, up to T+4
// for eNACH) and reports it as next_schedule_date. Until that charge lands,
// an active mandate covers the location up to that date (or this fallback
// when the event doesn't carry it); the grace period covers settlement.
const CASHFREE_FIRST_CHARGE_FALLBACK_MS = 4 * 24 * 60 * 60_000;

export async function applyCashfreeBilling(db: Db, event: SubscriptionWebhookEvent) {
  if (!event.subscriptionId?.startsWith('bill_')) return false;
  const [row] = await db
    .select()
    .from(schema.locationSubscription)
    .where(eq(schema.locationSubscription.id, event.subscriptionId));
  if (!row || row.provider !== 'cashfree') return false;
  const live = row.status !== 'cancelled' && row.status !== 'expired';
  const mapped = mapSubscriptionStatus(event.subscriptionStatus);
  if (event.subscriptionStatus && live) {
    const status: Subscription['status'] =
      mapped === 'active'
        ? 'active'
        : mapped === 'cancelled'
          ? 'cancelled'
          : mapped === 'expired' || mapped === 'completed'
            ? 'expired'
            : mapped === 'on_hold' || mapped === 'paused'
              ? 'past_due'
              : 'pending';
    await db
      .update(schema.locationSubscription)
      .set({ status, providerId: row.id, updatedAt: new Date() })
      .where(
        and(
          eq(schema.locationSubscription.id, row.id),
          inArray(schema.locationSubscription.status, [
            'initializing',
            'pending',
            'active',
            'past_due',
          ]),
        ),
      );
  }
  const authorized =
    mapped === 'active' ||
    ['ACTIVE', 'SUCCESS'].includes(event.authorizationStatus?.toUpperCase() ?? '') ||
    (event.payment?.status === 'SUCCESS' && event.payment.paymentType?.toUpperCase() === 'AUTH');
  if (authorized && live) await coverUntilFirstCharge(db, row, event.nextScheduleDate);
  if (
    event.payment?.status === 'SUCCESS' &&
    event.payment.paymentType?.toUpperCase() !== 'AUTH' &&
    Math.round(Number(event.payment.amount) * 100) === row.amountCents
  ) {
    const paidAt = event.payment.paidAt
      ? (parseCashfreeTime(event.payment.paidAt) ?? new Date())
      : new Date();
    // Counted from the charge, not from the current paidUntil, so a charge
    // after the provisional activation cover doesn't stack on top of it.
    const until = cycleEnd(paidAt, 'month', 1);
    const [paid] = await db
      .insert(schema.billingPayment)
      .values({
        id: `bpay_${randomUUID()}`,
        subscriptionId: row.id,
        providerPaymentId: `cashfree:${event.payment.key}`,
        paidAt,
        paidUntil: until,
      })
      .onConflictDoNothing()
      .returning();
    const expiry =
      paid?.paidUntil ??
      (
        await db
          .select()
          .from(schema.billingPayment)
          .where(eq(schema.billingPayment.providerPaymentId, `cashfree:${event.payment.key}`))
      )[0]?.paidUntil;
    if (expiry)
      await db
        .update(schema.locationSubscription)
        .set({
          paidUntil: sql`greatest(coalesce(${schema.locationSubscription.paidUntil}, '1970-01-01'::timestamp), ${utcTimestamp(expiry)})`,
          updatedAt: new Date(),
        })
        .where(eq(schema.locationSubscription.id, row.id));
  }
  return true;
}

// The mandate is authorized but the first CHARGE hasn't arrived: grant access
// up to the scheduled first debit so a subscription started after the trial
// isn't blocked in between. No-op once any charge is recorded; the charge
// then sets paidUntil from its own payment time.
async function coverUntilFirstCharge(db: Db, row: Subscription, nextScheduleDate: string | null) {
  const [charged] = await db
    .select({ id: schema.billingPayment.id })
    .from(schema.billingPayment)
    .where(eq(schema.billingPayment.subscriptionId, row.id))
    .limit(1);
  if (charged) return;
  const now = new Date();
  const scheduled = parseCashfreeTime(nextScheduleDate);
  // Capped at one cycle: a trial-time mandate's first debit is the trial
  // end, which the trial already covers.
  const cap = cycleEnd(now, 'month', 1);
  const until =
    scheduled && scheduled > now
      ? new Date(Math.min(scheduled.getTime(), cap.getTime()))
      : new Date(now.getTime() + CASHFREE_FIRST_CHARGE_FALLBACK_MS);
  await db
    .update(schema.locationSubscription)
    .set({
      paidUntil: sql`greatest(coalesce(${schema.locationSubscription.paidUntil}, '1970-01-01'::timestamp), ${utcTimestamp(until)})`,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.locationSubscription.id, row.id),
        inArray(schema.locationSubscription.status, [
          'initializing',
          'pending',
          'active',
          'past_due',
        ]),
      ),
    );
}
