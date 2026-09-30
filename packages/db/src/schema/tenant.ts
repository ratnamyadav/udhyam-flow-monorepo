// 1:1 with `organization` — holds the per-tenant brand + booking template config
// that powers the theme customizer + booking page.

import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './org';

export const tenantSettings = pgTable('tenant_settings', {
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
  fontDisplay: text('font_display').notNull().default('"Inter", system-ui, sans-serif'),
  fontUi: text('font_ui').notNull().default('"Inter", system-ui, sans-serif'),
  radius: integer('radius').notNull().default(8),
  density: text('density').notNull().default('comfortable'),
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
  // the tenant's Connect account only when this is true; otherwise we throw
  // a clear PRECONDITION_FAILED so the UI can prompt re-onboarding.
  stripeChargesEnabled: boolean('stripe_charges_enabled').notNull().default(false),
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
  // Where invoices get issued: 'none' | 'stripe' (built-in Stripe Invoicing
  // on the tenant's Connect account) | 'freshbooks' (needs a row in
  // integration_connection). `autoInvoice` issues one automatically when a
  // booking's payment webhook lands.
  invoiceProvider: text('invoice_provider').notNull().default('none'),
  autoInvoice: boolean('auto_invoice').notNull().default(false),
  onboardingStep: integer('onboarding_step').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
