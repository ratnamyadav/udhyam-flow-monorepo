// Recurring memberships ("₹2,000 / month") paid through Cashfree
// Subscriptions — the customer approves a UPI Autopay / eNACH / card mandate
// once and Cashfree debits them every cycle.
//
// - membership_plan: what a tenant sells. Amount + interval are frozen once
//   the plan exists at Cashfree (cashfree_plan_id set), because Cashfree
//   plans are immutable and live mandates were approved for that amount.
// - membership_subscription: one customer's mandate on a plan. The
//   Cashfree `subscription_id` is merchant-chosen and unique, so webhooks
//   find the row by it.
// - membership_payment: each debit Cashfree reports. Unique on the Cashfree
//   payment id so webhook retries can't double-record.

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { customer } from './customer';
import { organization } from './org';

export const MEMBERSHIP_INTERVALS = ['week', 'month', 'year'] as const;
export type MembershipInterval = (typeof MEMBERSHIP_INTERVALS)[number];

// Local mirror of Cashfree's subscription lifecycle (see
// packages/api/src/memberships/status.ts for the mapping). `failed` is ours:
// the Cashfree create call itself errored.
export const MEMBERSHIP_SUBSCRIPTION_STATUSES = [
  'initialized',
  'pending_approval',
  'active',
  'on_hold',
  'paused',
  'cancelled',
  'completed',
  'expired',
  'failed',
] as const;
export type MembershipSubscriptionStatus = (typeof MEMBERSHIP_SUBSCRIPTION_STATUSES)[number];

export const MEMBERSHIP_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'cancelled'] as const;
export type MembershipPaymentStatus = (typeof MEMBERSHIP_PAYMENT_STATUSES)[number];

export const membershipPlan = pgTable(
  'membership_plan',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('INR'),
    interval: text('interval').$type<MembershipInterval>().notNull().default('month'),
    intervalCount: integer('interval_count').notNull().default(1),
    // Informational only ("8 classes / month") — we don't enforce it.
    sessionsPerCycle: integer('sessions_per_cycle'),
    // Inactive plans are hidden from the public page; existing
    // subscriptions keep billing until cancelled.
    active: boolean('active').notNull().default(true),
    // Set lazily on first subscribe; null means "not yet created at Cashfree".
    cashfreePlanId: text('cashfree_plan_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('membership_plan_org_idx').on(t.organizationId)],
);

export const membershipSubscription = pgTable(
  'membership_subscription',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // No cascade from plan/customer: keep billing history if either is
    // removed later.
    planId: text('plan_id')
      .notNull()
      .references(() => membershipPlan.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customer.id),
    // Merchant-side id we send to Cashfree as `subscription_id`.
    cashfreeSubscriptionId: text('cashfree_subscription_id').notNull(),
    // Cashfree's own reference (`cf_subscription_id`), for support tickets.
    cashfreeReference: text('cashfree_reference'),
    // `subscription_session_id` — what Cashfree.js needs to open the mandate
    // approval checkout. Our /book/[orgSlug]/memberships/authorize page
    // turns it into a shareable authorization link.
    cashfreeSessionId: text('cashfree_session_id'),
    status: text('status').$type<MembershipSubscriptionStatus>().notNull().default('initialized'),
    // Cashfree's raw status string, kept for debugging unmapped values.
    cashfreeStatus: text('cashfree_status'),
    nextChargeAt: timestamp('next_charge_at'),
    authorizedAt: timestamp('authorized_at'),
    cancelledAt: timestamp('cancelled_at'),
    // Throttles the return page's server-side status fetch.
    syncedAt: timestamp('synced_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('membership_subscription_cf_id_uniq').on(t.cashfreeSubscriptionId),
    index('membership_subscription_org_idx').on(t.organizationId),
    index('membership_subscription_customer_idx').on(t.customerId),
  ],
);

export const membershipPayment = pgTable(
  'membership_payment',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => membershipSubscription.id, { onDelete: 'cascade' }),
    // `cf_payment_id` (falls back to the merchant `payment_id`). Unique →
    // webhook idempotency.
    cashfreePaymentId: text('cashfree_payment_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('INR'),
    status: text('status').$type<MembershipPaymentStatus>().notNull(),
    failureReason: text('failure_reason'),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('membership_payment_cf_id_uniq').on(t.cashfreePaymentId),
    index('membership_payment_subscription_idx').on(t.subscriptionId),
  ],
);
