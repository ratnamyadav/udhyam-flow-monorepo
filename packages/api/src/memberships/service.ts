// DB orchestration for memberships: lazily creating Cashfree plans,
// starting subscriptions, syncing status and recording debits. The HTTP
// client (cashfree-subscriptions.ts) knows nothing about our tables; this
// file knows nothing about HTTP.
//
// Neon's HTTP driver has no transactions, so every multi-step flow is
// ordered to be safe on partial failure: rows are written before the
// Cashfree call (so a webhook can always find them), and follow-up writes
// are conditional updates.

import { randomUUID } from 'node:crypto';
import { type Db, schema } from '@udyamflow/db';
import { and, eq, isNull, notInArray, or } from 'drizzle-orm';
import {
  CashfreeApiError,
  type CashfreeSubscription,
  type CashfreeSubscriptionsClient,
} from './cashfree-subscriptions';
import {
  cashfreePlanIdFor,
  isTerminalSubscriptionStatus,
  mapPaymentStatus,
  mapSubscriptionStatus,
  parseCashfreeTime,
  rupeesToPaise,
  TERMINAL_SUBSCRIPTION_STATUSES,
  toCashfreeIntervalType,
} from './status';
import type { SubscriptionWebhookEvent, SubscriptionWebhookPayment } from './webhook';

type PlanRow = typeof schema.membershipPlan.$inferSelect;
type SubscriptionRow = typeof schema.membershipSubscription.$inferSelect;

// Settlement hook for Cashfree Easy Split. Per-tenant vendor ids are being
// added separately (split settlements for one-off payments); once that
// lands, look the tenant's vendor id up here and every new membership will
// settle to the tenant. Cashfree Subscriptions accepts
// `subscription_payment_splits: [{ vendor_id, percentage }]` on create
// (cashfree-pg SDK v6 CreateSubscriptionRequest), which startSubscription
// already sends when this returns non-null. `percentage` defaults to 100.
export async function resolveTenantSettlement(
  _organizationId: string,
): Promise<null | { vendorId: string; percentage?: number }> {
  return null;
}

export function membershipAuthorizationUrl(appUrl: string, orgSlug: string, subId: string) {
  return `${appUrl}/book/${orgSlug}/memberships/authorize?sub=${encodeURIComponent(subId)}`;
}

export function membershipReturnUrl(appUrl: string, orgSlug: string, subId: string) {
  return `${appUrl}/book/${orgSlug}/memberships/return?sub=${encodeURIComponent(subId)}`;
}

// Creates the Cashfree plan on first use and persists its id. The Cashfree
// plan id is derived from ours, so two concurrent first subscribers race
// harmlessly: the loser gets a conflict, confirms the plan exists, moves on.
export async function ensureCashfreePlan(
  db: Db,
  client: CashfreeSubscriptionsClient,
  plan: PlanRow,
): Promise<string> {
  if (plan.cashfreePlanId) return plan.cashfreePlanId;
  const cfPlanId = cashfreePlanIdFor(plan.id);
  try {
    await client.createPlan({
      planId: cfPlanId,
      name: plan.name,
      amountPaise: plan.amountCents,
      currency: plan.currency,
      intervalType: toCashfreeIntervalType(plan.interval),
      intervals: plan.intervalCount,
      note: plan.description ?? undefined,
    });
  } catch (err) {
    const maybeExists =
      err instanceof CashfreeApiError &&
      (err.status === 409 || /already|exist|duplicate/i.test(err.message));
    if (!maybeExists) throw err;
    await client.fetchPlan(cfPlanId).catch(() => {
      throw err;
    });
  }
  await db
    .update(schema.membershipPlan)
    .set({ cashfreePlanId: cfPlanId, updatedAt: new Date() })
    .where(
      and(eq(schema.membershipPlan.id, plan.id), isNull(schema.membershipPlan.cashfreePlanId)),
    );
  return cfPlanId;
}

export async function startSubscription(
  db: Db,
  client: CashfreeSubscriptionsClient,
  args: {
    org: { id: string; slug: string; name: string };
    plan: PlanRow;
    customer: { id: string; name: string; email: string; phone: string };
    appUrl: string;
  },
): Promise<{ subscriptionId: string; authorizationUrl: string }> {
  const id = `msub_${randomUUID()}`;
  // Row first: a webhook for this subscription can never outrun it.
  await db.insert(schema.membershipSubscription).values({
    id,
    organizationId: args.org.id,
    planId: args.plan.id,
    customerId: args.customer.id,
    cashfreeSubscriptionId: id,
    status: 'initialized',
  });

  let cf: CashfreeSubscription;
  try {
    const cfPlanId = await ensureCashfreePlan(db, client, args.plan);
    const settlement = await resolveTenantSettlement(args.org.id);
    cf = await client.createSubscription({
      subscriptionId: id,
      planId: cfPlanId,
      customer: {
        name: args.customer.name,
        email: args.customer.email,
        phone: args.customer.phone,
      },
      returnUrl: membershipReturnUrl(args.appUrl, args.org.slug, id),
      splits: settlement
        ? [{ vendorId: settlement.vendorId, percentage: settlement.percentage ?? 100 }]
        : undefined,
      tags: {
        organization_id: args.org.id,
        plan_id: args.plan.id,
        // Shown to the customer in their UPI app / bank statement.
        psp_note: `${args.plan.name} · ${args.org.name}`.slice(0, 255),
      },
    });
  } catch (err) {
    await db
      .update(schema.membershipSubscription)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(schema.membershipSubscription.id, id));
    throw err;
  }

  if (!cf.subscription_session_id) {
    await db
      .update(schema.membershipSubscription)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(schema.membershipSubscription.id, id));
    throw new Error('Cashfree did not return a subscription session id');
  }

  await db
    .update(schema.membershipSubscription)
    .set({
      cashfreeReference: cf.cf_subscription_id ?? null,
      cashfreeSessionId: cf.subscription_session_id,
      cashfreeStatus: cf.subscription_status ?? null,
      status: mapSubscriptionStatus(cf.subscription_status) ?? 'initialized',
      syncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.membershipSubscription.id, id));

  return {
    subscriptionId: id,
    authorizationUrl: membershipAuthorizationUrl(args.appUrl, args.org.slug, id),
  };
}

// Applies a Cashfree view of the subscription to our row. Terminal rows are
// never moved (out-of-order webhooks), and the WHERE clause re-checks that
// so a concurrent cancel can't be overwritten.
export async function applyCashfreeState(
  db: Db,
  row: SubscriptionRow,
  state: {
    cashfreeStatus: string | null;
    nextScheduleDate?: string | null;
    cashfreeReference?: string | null;
    authorizationTime?: string | null;
  },
): Promise<SubscriptionRow['status']> {
  const now = new Date();
  const mapped = mapSubscriptionStatus(state.cashfreeStatus);
  if (isTerminalSubscriptionStatus(row.status)) {
    await db
      .update(schema.membershipSubscription)
      .set({ syncedAt: now })
      .where(eq(schema.membershipSubscription.id, row.id));
    return row.status;
  }

  const patch: Partial<typeof schema.membershipSubscription.$inferInsert> = {
    syncedAt: now,
    updatedAt: now,
  };
  if (state.cashfreeStatus) patch.cashfreeStatus = state.cashfreeStatus;
  if (mapped) patch.status = mapped;
  if (state.cashfreeReference && !row.cashfreeReference) {
    patch.cashfreeReference = state.cashfreeReference;
  }
  if (state.nextScheduleDate !== undefined) {
    patch.nextChargeAt = parseCashfreeTime(state.nextScheduleDate);
  }
  if ((mapped === 'active' || mapped === 'pending_approval') && !row.authorizedAt) {
    patch.authorizedAt = parseCashfreeTime(state.authorizationTime) ?? now;
  }
  if (mapped && isTerminalSubscriptionStatus(mapped)) {
    patch.nextChargeAt = null;
    if (mapped === 'cancelled') patch.cancelledAt = now;
  }

  await db
    .update(schema.membershipSubscription)
    .set(patch)
    .where(
      and(
        eq(schema.membershipSubscription.id, row.id),
        notInArray(schema.membershipSubscription.status, [...TERMINAL_SUBSCRIPTION_STATUSES]),
      ),
    );
  return mapped ?? row.status;
}

export async function syncSubscriptionFromCashfree(
  db: Db,
  client: CashfreeSubscriptionsClient,
  row: SubscriptionRow,
): Promise<SubscriptionRow['status']> {
  const cf = await client.fetchSubscription(row.cashfreeSubscriptionId);
  return applyCashfreeState(db, row, {
    cashfreeStatus: cf.subscription_status ?? null,
    nextScheduleDate: cf.next_schedule_date ?? null,
    cashfreeReference: cf.cf_subscription_id ?? null,
    authorizationTime: cf.authorisation_details?.authorization_time ?? null,
  });
}

export async function cancelSubscription(
  db: Db,
  client: CashfreeSubscriptionsClient | null,
  row: SubscriptionRow,
): Promise<void> {
  // `failed` rows never made it to Cashfree — nothing to cancel remotely.
  if (row.status !== 'failed') {
    if (!client) throw new Error('Cashfree is not configured');
    await client.manageSubscription(row.cashfreeSubscriptionId, 'CANCEL');
  }
  const now = new Date();
  await db
    .update(schema.membershipSubscription)
    .set({
      status: 'cancelled',
      cashfreeStatus: row.status === 'failed' ? row.cashfreeStatus : 'CANCELLED',
      cancelledAt: now,
      nextChargeAt: null,
      updatedAt: now,
    })
    .where(eq(schema.membershipSubscription.id, row.id));
}

// Idempotent on the Cashfree payment id. A repeat event only ever moves a
// payment forward (pending → paid/failed/cancelled, failed → paid for UPI
// retries), never back.
export async function recordPayment(
  db: Db,
  row: SubscriptionRow,
  payment: SubscriptionWebhookPayment,
  fallbackAmountCents: number,
): Promise<'inserted' | 'updated' | 'ignored'> {
  const status = mapPaymentStatus(payment.status);
  if (!status) return 'ignored';
  const paidAt = status === 'paid' ? new Date() : null;

  const inserted = await db
    .insert(schema.membershipPayment)
    .values({
      id: `mpay_${randomUUID()}`,
      organizationId: row.organizationId,
      subscriptionId: row.id,
      cashfreePaymentId: payment.key,
      amountCents: rupeesToPaise(payment.amount) ?? fallbackAmountCents,
      status,
      failureReason: payment.failureReason,
      paidAt,
    })
    .onConflictDoNothing({ target: schema.membershipPayment.cashfreePaymentId })
    .returning({ id: schema.membershipPayment.id });
  if (inserted.length > 0) return 'inserted';

  if (status === 'pending') return 'ignored';
  const upgradable =
    status === 'paid'
      ? or(
          eq(schema.membershipPayment.status, 'pending'),
          eq(schema.membershipPayment.status, 'failed'),
        )
      : eq(schema.membershipPayment.status, 'pending');
  const updated = await db
    .update(schema.membershipPayment)
    .set({ status, paidAt, failureReason: payment.failureReason })
    .where(and(eq(schema.membershipPayment.cashfreePaymentId, payment.key), upgradable))
    .returning({ id: schema.membershipPayment.id });
  return updated.length > 0 ? 'updated' : 'ignored';
}

export async function applySubscriptionWebhook(
  db: Db,
  client: CashfreeSubscriptionsClient | null,
  event: SubscriptionWebhookEvent,
): Promise<{ handled: boolean; reason?: string }> {
  if (!event.type.startsWith('SUBSCRIPTION_')) {
    return { handled: false, reason: 'not a subscription event' };
  }
  if (!event.subscriptionId) return { handled: false, reason: 'no subscription_id' };

  const [found] = await db
    .select({ sub: schema.membershipSubscription, planAmount: schema.membershipPlan.amountCents })
    .from(schema.membershipSubscription)
    .innerJoin(
      schema.membershipPlan,
      eq(schema.membershipPlan.id, schema.membershipSubscription.planId),
    )
    .where(eq(schema.membershipSubscription.cashfreeSubscriptionId, event.subscriptionId));
  if (!found) return { handled: false, reason: 'unknown subscription' };
  const row = found.sub;

  if (event.subscriptionStatus) {
    await applyCashfreeState(db, row, {
      cashfreeStatus: event.subscriptionStatus,
      nextScheduleDate: event.nextScheduleDate,
      cashfreeReference: event.cfSubscriptionId,
    });
  }

  // AUTH payments are the mandate-approval step, not membership dues.
  if (event.payment && event.payment.paymentType?.toUpperCase() !== 'AUTH') {
    await recordPayment(db, row, event.payment, found.planAmount);
  }

  // Auth / payment events don't carry the subscription status or the next
  // debit date — pull them from Cashfree. Best effort: the webhook itself
  // has already been recorded, and the next event or page view will retry.
  if (!event.subscriptionStatus && client) {
    try {
      await syncSubscriptionFromCashfree(db, client, row);
    } catch (err) {
      console.warn('[memberships] post-webhook sync failed', err);
    }
  }
  return { handled: true };
}
