import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { location } from './location';
import { organization } from './org';

// Each location has its own recurring authorization. Adding a branch never
// changes the amount approved on an existing mandate.
export const locationSubscription = pgTable(
  'location_subscription',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => location.id),
    provider: text('provider').$type<'stripe' | 'cashfree'>().notNull(),
    providerId: text('provider_id'),
    checkoutId: text('checkout_id'),
    checkoutUrl: text('checkout_url'),
    status: text('status')
      .$type<'initializing' | 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired'>()
      .notNull()
      .default('initializing'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    paidUntil: timestamp('paid_until'),
    lastEventAt: timestamp('last_event_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('location_subscription_current_uniq')
      .on(t.locationId)
      .where(sql`status NOT IN ('cancelled', 'expired')`),
    uniqueIndex('location_subscription_provider_uniq').on(t.provider, t.providerId),
    index('location_subscription_org_idx').on(t.organizationId),
  ],
);

export const billingPayment = pgTable(
  'billing_payment',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => locationSubscription.id),
    providerPaymentId: text('provider_payment_id').notNull(),
    paidAt: timestamp('paid_at').notNull(),
    paidUntil: timestamp('paid_until').notNull(),
  },
  (t) => [uniqueIndex('billing_payment_provider_uniq').on(t.providerPaymentId)],
);
