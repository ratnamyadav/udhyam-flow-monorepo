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

import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organization } from './org';

export const integrationConnection = pgTable(
  'integration_connection',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // 'freshbooks' | 'zoho_books' (future: 'quickbooks' | 'xero')
    provider: text('provider').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    // Provider-side identifiers. For FreshBooks: accountId drives the
    // accounting API paths, businessId the newer business-scoped APIs.
    externalAccountId: text('external_account_id'),
    externalBusinessId: text('external_business_id'),
    displayName: text('display_name'),
    // Provider-specific extras, e.g. Zoho's per-data-centre hosts
    // ({ accountsUrl, apiDomain }).
    metadata: jsonb('metadata').$type<Record<string, string>>(),
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
    // 'udyamflow' | 'stripe' | 'freshbooks' | 'zoho_books'
    provider: text('provider').notNull(),
    externalId: text('external_id'),
    number: text('number'),
    // `pending` (claimed, provider call in flight), `draft`, `open` (sent /
    // awaiting payment), `paid`, `void`.
    status: text('status').notNull().default('pending'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    // Customer-facing link (Stripe hosted invoice page / FreshBooks share
    // link / our own /invoice/[id] page for the built-in provider).
    hostedUrl: text('hosted_url'),
    // GST breakdown — filled for the built-in provider and Zoho Books.
    // `documentType`: 'tax_invoice' | 'bill_of_supply' | 'invoice'.
    documentType: text('document_type'),
    taxableCents: integer('taxable_cents'),
    cgstCents: integer('cgst_cents'),
    sgstCents: integer('sgst_cents'),
    igstCents: integer('igst_cents'),
    gstRateBps: integer('gst_rate_bps'),
    sacCode: text('sac_code'),
    placeOfSupply: text('place_of_supply'),
    supplierGstin: text('supplier_gstin'),
    customerGstin: text('customer_gstin'),
    issuedAt: timestamp('issued_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invoice_booking_uniq').on(t.bookingId)],
);

// Gap-free per-tenant invoice numbering for the built-in provider, reset
// each Indian financial year (April–March) as GST expects. Incremented with
// a single INSERT … ON CONFLICT DO UPDATE … RETURNING, which is atomic
// without a transaction.
export const invoiceSequence = pgTable(
  'invoice_sequence',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    financialYear: text('financial_year').notNull(), // e.g. "26-27"
    lastNumber: integer('last_number').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.financialYear] })],
);
