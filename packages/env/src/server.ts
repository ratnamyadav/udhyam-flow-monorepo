// Server-side env schema. Parsed at boot by every server entrypoint that
// imports it (Next apps via next.config.ts, the seed script, the auth +
// db packages). Missing required vars throw with a readable summary.

import { z } from 'zod';

export const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(16, 'must be ≥16 chars (try `openssl rand -hex 32`)'),
  BETTER_AUTH_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_AUTH_URL: z.url(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  // Public Sentry DSN (browser bundle) — kept identical to SENTRY_DSN in
  // most setups but separated so secrets-management tooling can tell them
  // apart.
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  // Cloudflare R2 for tenant logo uploads. All optional — if unset, the
  // upload endpoint returns 503 and the branding page hides the file
  // picker, falling back to the letter badge.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.url().optional(),
  // MSG91 (India-focused SMS + WhatsApp gateway). Optional — without
  // MSG91_AUTH_KEY, notifications fall back to console.log in dev.
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SMS_SENDER: z.string().optional(),
  MSG91_SMS_TEMPLATE_ID: z.string().optional(),
  MSG91_WHATSAPP_NUMBER: z.string().optional(),
  MSG91_WHATSAPP_INTEGRATED_NUMBER: z.string().optional(),
  // Payments — Stripe (global) and Cashfree (India). All optional; if a
  // gateway is unconfigured the booking page treats it as `none` and skips
  // checkout for services priced in its currency.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CASHFREE_CLIENT_ID: z.string().optional(),
  CASHFREE_CLIENT_SECRET: z.string().optional(),
  // 'sandbox' | 'production' — defaults to sandbox.
  CASHFREE_ENV: z.enum(['sandbox', 'production']).optional(),
  // Easy Split: % of each INR order the platform keeps (default 0 — the
  // tenant's vendor gets everything). 'true' in CASHFREE_REQUIRE_VENDOR
  // refuses INR checkouts for tenants without an ACTIVE payout vendor.
  CASHFREE_PLATFORM_FEE_PERCENT: z.string().optional(),
  CASHFREE_REQUIRE_VENDOR: z.enum(['true', 'false']).optional(),
  // FreshBooks OAuth app (invoicing integration). Optional — without both,
  // the invoicing settings page hides the "Connect FreshBooks" button.
  // Register the redirect URI `${NEXT_PUBLIC_APP_URL}/api/integrations/freshbooks/callback`
  // in the FreshBooks developer portal (FreshBooks requires https).
  FRESHBOOKS_CLIENT_ID: z.string().optional(),
  FRESHBOOKS_CLIENT_SECRET: z.string().optional(),
  // Google OAuth — optional. Sign-in/up pages hide the Google button when
  // not configured.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Rate limiting via Upstash. Optional — when unset, we use an in-memory
  // map (fine for dev, logs a warning if NODE_ENV=production).
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let _cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (_cached) return _cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const lines = Object.entries(flat).map(([k, v]) => `  • ${k}: ${(v ?? []).join(', ')}`);
    throw new Error(
      `Invalid or missing server env vars:\n${lines.join('\n')}\n\nSee .env.example for the full list.`,
    );
  }
  _cached = parsed.data;
  return _cached;
}
