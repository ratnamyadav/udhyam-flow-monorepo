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
