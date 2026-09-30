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
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  // Extra origins BetterAuth should accept (comma-separated), and the admin
  // app's public URL. BETTER_AUTH_URL + NEXT_PUBLIC_APP_URL are always trusted.
  ADMIN_APP_URL: z.url().optional(),
  TRUSTED_ORIGINS: z.string().optional(),
  // Key for encrypting tenant secrets at rest. Falls back to one derived
  // from BETTER_AUTH_SECRET. Rotate by moving the old value to *_PREVIOUS.
  ENCRYPTION_KEY: z.string().min(32).optional(),
  ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
  // The client-IP header your edge sets and clients can't spoof, for rate
  // limiting (e.g. cf-connecting-ip, x-real-ip).
  TRUSTED_IP_HEADER: z.string().optional(),
  // Object storage for tenant logo uploads — any S3-compatible provider
  // (AWS S3, Cloudflare R2, MinIO, Spaces, B2, Wasabi…). All optional; if
  // unset the upload endpoint returns 503 and branding falls back to the
  // letter badge. See packages/storage/src/config.ts.
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.url().optional(),
  STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),
  // Legacy Cloudflare R2 variables — still honored when STORAGE_* is unset.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.url().optional(),
  // MSG91 (India-focused SMS + WhatsApp gateway). Optional — without
  // MSG91_AUTH_KEY, notifications fall back to console.log in dev.
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SMS_SENDER: z.string().optional(),
  // DLT template ids: booking confirmation, and cancellation (without the
  // latter, cancellation SMS are skipped rather than sending the wrong text).
  MSG91_SMS_TEMPLATE_ID: z.string().optional(),
  MSG91_SMS_CANCEL_TEMPLATE_ID: z.string().optional(),
  MSG91_WHATSAPP_INTEGRATED_NUMBER: z.string().optional(),
  // Shared secret for the MSG91 inbound WhatsApp webhook (customer button
  // replies). Passed as `?secret=` in the webhook URL configured in MSG91.
  // Unset → the inbound endpoint returns 503.
  MSG91_WEBHOOK_SECRET: z.string().optional(),
  // Payments — Stripe (global) and Cashfree (India). All optional; if a
  // gateway is unconfigured the booking page treats it as `none` and skips
  // checkout for services priced in its currency.
  STRIPE_SECRET_KEY: z.string().optional(),
  // Stripe signs platform events and Connect ("events on connected
  // accounts") events with different secrets — one per webhook endpoint.
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
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
  // Zoho Books OAuth client (api-console.zoho.in, server-based app; enable
  // multi-DC to accept users outside India). Redirect URI:
  // `${NEXT_PUBLIC_APP_URL}/api/integrations/zoho/callback`.
  ZOHO_CLIENT_ID: z.string().optional(),
  ZOHO_CLIENT_SECRET: z.string().optional(),
  // Where consent starts — defaults to https://accounts.zoho.in.
  ZOHO_ACCOUNTS_URL: z.url().optional(),
  // Google OAuth — optional. Sign-in/up pages hide the Google button when
  // not configured.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Rate limiting via Upstash. Optional — when unset, we use an in-memory
  // map (fine for dev, logs a warning if NODE_ENV=production).
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  // Bearer token Vercel Cron sends to /api/cron/* (set it in the Vercel
  // project and Vercel adds the header). Unset → cron endpoints return 503.
  CRON_SECRET: z.string().optional(),
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
