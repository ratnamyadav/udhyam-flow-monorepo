// 1:1 with `organization` — holds the per-tenant brand + booking template config
// that powers the theme customizer + booking page.

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organization } from './org';

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organization.id, { onDelete: 'cascade' }),
    profession: text('profession').notNull().default('doctor'),
    templateId: text('template_id').notNull().default('doctor'),
    logoText: text('logo_text').notNull().default('UF'),
    // Nullable URL of an uploaded image logo. When set, UI prefers it over
    // logoText. Lives on Cloudflare R2; the URL is the public CDN-fronted one.
    logoUrl: text('logo_url'),
    accent: text('accent').notNull().default('#0f766e'),
    accentSoft: text('accent_soft').notNull().default('#ccfbf1'),
    accentInk: text('accent_ink').notNull().default('#134e4a'),
    // Font ids from @udyamflow/tokens FONT_OPTIONS (older rows may hold a
    // CSS stack; fontStack() maps both).
    fontDisplay: text('font_display').notNull().default('inter'),
    fontUi: text('font_ui').notNull().default('inter'),
    radius: integer('radius').notNull().default(8),
    density: text('density').notNull().default('comfortable'),
    // Public booking page: default layout (a `?layout=` URL param still
    // overrides it) and optional custom copy. Null copy = profession default.
    bookingLayout: text('booking_layout').notNull().default('sidebar'),
    bookingHeadline: text('booking_headline'),
    bookingIntro: text('booking_intro'),
    currency: text('currency').notNull().default('USD'),
    // Per-tenant opt-in flags for MSG91 notifications. UI hides these toggles
    // unless MSG91_AUTH_KEY is configured on the server.
    enableSms: boolean('enable_sms').notNull().default(false),
    enableWhatsapp: boolean('enable_whatsapp').notNull().default(false),
    // Payment provider configuration. Stored encrypted-at-rest at the column
    // level for the API key; the merchant id + account id are plaintext.
    stripeAccountId: text('stripe_account_id'),
    // Set true when Stripe's `charges_enabled` flag flips on for the connected
    // account (driven by the account.updated webhook). Checkouts route via
    // the tenant's Connect account only when this is true; otherwise they
    // settle to the platform account.
    stripeChargesEnabled: boolean('stripe_charges_enabled').notNull().default(false),
    // Tenant's own Cashfree credentials (App ID + encrypted Secret Key). When
    // both are set, INR checkouts settle to the tenant's Cashfree account;
    // otherwise they use the platform credentials from the environment.
    cashfreeMerchantId: text('cashfree_merchant_id'),
    cashfreeApiKey: text('cashfree_api_key'),
    // Cashfree Easy Split vendor for this tenant — INR payments settle to
    // their bank/UPI directly once the vendor is ACTIVE. We never store bank
    // details; `cashfreePayoutLabel` is a masked hint for the UI ("HDFC ••1234").
    cashfreeVendorId: text('cashfree_vendor_id'),
    cashfreeVendorStatus: text('cashfree_vendor_status'),
    cashfreePayoutLabel: text('cashfree_payout_label'),
    // GST profile, used by the built-in invoice provider and Zoho Books.
    // `gstStateCode` doubles as "this business is in India" — without it the
    // built-in provider issues a plain (non-GST) invoice.
    gstRegistered: boolean('gst_registered').notNull().default(false),
    gstin: text('gstin'),
    gstLegalName: text('gst_legal_name'),
    gstStateCode: text('gst_state_code'),
    billingAddress: text('billing_address'),
    // Up to 4 chars; invoice numbers look like "INV/26-27/0001" (GST caps
    // invoice numbers at 16 chars, alphanumerics plus - and /).
    invoicePrefix: text('invoice_prefix').notNull().default('INV'),
    // Charge GST only on transactions strictly above this (paise). null =
    // use the platform default from the admin panel; 0 = charge on every
    // transaction regardless of the platform default. Editable by the store
    // (Settings → Invoicing) and by UdyamFlow admins.
    gstThresholdCents: integer('gst_threshold_cents'),
    // Where invoices get issued: 'none' | 'stripe' (built-in Stripe Invoicing
    // on the tenant's Connect account) | 'freshbooks' (needs a row in
    // integration_connection). `autoInvoice` issues one automatically when a
    // booking's payment webhook lands.
    invoiceProvider: text('invoice_provider').notNull().default('none'),
    autoInvoice: boolean('auto_invoice').notNull().default(false),
    onboardingStep: integer('onboarding_step').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  // One Stripe Connect account belongs to exactly one tenant.
  (t) => [
    uniqueIndex('tenant_settings_stripe_account_uniq').on(t.stripeAccountId),
    check(
      'tenant_settings_booking_layout_check',
      sql`${t.bookingLayout} IN ('sidebar', 'stacked', 'inline')`,
    ),
  ],
);
