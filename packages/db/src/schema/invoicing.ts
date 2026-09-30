// Invoicing + third-party accounting integrations.
//
// `integration_connection` holds per-tenant OAuth credentials for external
// accounting tools (FreshBooks today; QuickBooks / Xero / Zoho Books slot in
// with a new `provider` value). Tokens are encrypted at rest via the api
// package's `encrypt()` helper — never read them without `decrypt()`.
//
// `invoice` is our local mirror of an invoice issued in the tenant's chosen
// provider (Stripe Invoicing or an accounting tool). One invoice per booking,
// enforced by a unique index so double-clicks and webhook retries can't
// issue twice.

import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './org';

export const integrationConnection = pgTable(
  'integration_connection',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // 'freshbooks' (future: 'quickbooks' | 'xero' | 'zoho_books')
    provider: text('provider').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    // Provider-side identifiers. For FreshBooks: accountId drives the
    // accounting API paths, businessId the newer business-scoped APIs.
    externalAccountId: text('external_account_id'),
    externalBusinessId: text('external_business_id'),
    displayName: text('display_name'),
    connectedByUserId: text('connected_by_user_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('integration_connection_org_provider_uniq').on(t.organizationId, t.provider)],
);

export const invoice = pgTable(
  'invoice',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // No FK cascade — same reasoning as booking.customer_id: keep the
    // financial record even if the booking row is later removed.
    bookingId: text('booking_id').notNull(),
    customerId: text('customer_id'),
    // 'stripe' | 'freshbooks'
    provider: text('provider').notNull(),
    externalId: text('external_id'),
    number: text('number'),
    // `pending` (claimed, provider call in flight), `draft`, `open` (sent /
    // awaiting payment), `paid`, `void`.
    status: text('status').notNull().default('pending'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    // Customer-facing link (Stripe hosted invoice page / FreshBooks share link).
    hostedUrl: text('hosted_url'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invoice_booking_uniq').on(t.bookingId)],
);
