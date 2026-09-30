# UdyamFlow

A multi-tenant **booking SaaS** that adapts to whoever's taking bookings — doctors, tutors, sports facilities, salons, therapists, fitness trainers. Tenants pick a profession template, recolor it to match their brand, add their locations, and they're taking bookings the same afternoon.

Pricing: **free for the first 6 months**, then per-location:
- 🌐 **Global** — ~~$50~~ → **$10** / location / month
- 🇮🇳 **India** — ~~₹1,000~~ → **₹299** / location / month

---

## Architecture

A pnpm + Turborepo monorepo with three apps and eight shared packages.

```
udhyam-flow/
├── apps/
│   ├── web/        Next.js 16 — UdyamFlow tenant-facing SaaS (full design)
│   ├── admin/      Next.js 16 — internal staff panel (platform overview, orgs, users)
│   └── mobile/     Expo SDK 55 + expo-router — owner app + public booking flow
├── packages/
│   ├── auth/       BetterAuth server + web client + Expo client
│   ├── db/         Drizzle ORM schema + Neon Postgres client + seed
│   ├── api/        tRPC v11 routers, tenant/role middleware, payment lifecycle
│   ├── env/        Zod-validated server + client env schemas
│   ├── notifications/  Email (Resend), SMS + WhatsApp (MSG91)
│   ├── storage/    S3-compatible object storage (logo uploads)
│   ├── ui/         shadcn-style primitives + UdyamFlow theme tokens
│   ├── tokens/     Design tokens (palette, tenants, professions, density)
│   └── tsconfig/   Shared TypeScript presets (base / nextjs / expo / react-library)
└── tooling/
    └── biome/      Shared Biome (formatter + linter) config
```

### Tech stack

| Layer | Choice | Version |
|---|---|---|
| Package manager | **pnpm** workspaces + catalog | 9.15+ |
| Build orchestrator | **Turborepo** | 2.9 |
| Language | **TypeScript** (Go-port `tsgo` for typecheck, `typescript` for tooling) | 7.0 beta + 6.0 |
| Linter / formatter | **Biome** | 2.4 |
| Web framework | **Next.js** App Router (Turbopack) | 16.2 |
| Mobile framework | **Expo** + expo-router | SDK 55 |
| UI styling (web) | **Tailwind CSS** v4 + shadcn-style primitives | 4.2 |
| UI styling (mobile) | **NativeWind** v5 preview + Tailwind v4 | 5.0-preview |
| Database | **Postgres** on **Neon** (`@neondatabase/serverless`) | latest |
| ORM | **Drizzle ORM** + drizzle-kit | 0.45 / 0.31 |
| Auth | **BetterAuth** (organization plugin + Expo plugin) | 1.6 |
| API layer | **tRPC** v11 + TanStack Query | 11.16 / 5.10 |
| Data fetching | **@tanstack/react-query** | 5.10 |
| Schema validation | **Zod** | 4.3 |
| RPC serialization | **superjson** | 2.2 |
| Theming | **next-themes** + per-tenant CSS vars | 0.4 |

### Data model

Postgres schema is split by domain in `packages/db/src/schema/`:

- **Auth** — `user`, `session`, `account`, `verification` (BetterAuth core)
- **Org** — `organization`, `member`, `invitation` (BetterAuth org plugin; orgs == tenants)
- **Tenant** — `tenant_settings` 1:1 with `organization` (theme, profession, template, density, currency)
- **Booking** — `location`, `resource`, `resource_hours`, `service`, `service_resource`, `booking`
- **CRM** — `customer` (deduped per org by email, then phone; optional GSTIN / state for B2B invoices)
- **Invoicing** — `invoice` (one per booking, mirrors the provider's invoice), `invoice_sequence`, `integration_connection` (encrypted OAuth tokens for accounting tools)
- **Memberships** — `membership_plan`, `membership_subscription`, `membership_payment` (Cashfree Subscriptions)
- **Platform** — `platform_settings` (e.g. the default GST threshold)

Multi-tenancy is **shared DB, scoped by `organization_id`** on every tenant table. The tRPC `tenantProcedure` middleware reads the active org from the session (BetterAuth's `activeOrganizationId`), **verifies the caller is still a member**, and scopes all queries to it. `tenantAdminProcedure` additionally requires the `owner` or `admin` role.

Locations, resources and services are **archived, never deleted** (`archived_at`), so booking history and revenue reports survive catalog changes.

**Booking lifecycle** — `pending_payment → confirmed → completed | no_show | cancelled`, or `pending_payment → expired`. A paid service holds its slot as `pending_payment` for ~35 minutes while the customer pays; the payment webhook confirms it, an abandoned checkout releases it. Double booking is prevented by the database itself: a `btree_gist` exclusion constraint forbids overlapping slot-occupying bookings on the same resource (see `packages/db/src/constraints.ts`). All slot math is done on calendar dates in the location's timezone.

### App responsibilities

| App | Port | Responsibilities |
|---|---|---|
| `apps/web` | 3000 | Marketing landing, pricing, sign-in/up, 5-step onboarding wizard, owner dashboard, theme customizer with live preview, three booking layouts (sidebar/stacked/inline), multi-tenant location switcher |
| `apps/admin` | 3001 | Internal staff panel gated by `user.role === 'admin'` — platform overview, organizations, users, and GST thresholds (`/gst`: platform default and per-store overrides). Shares the BetterAuth session DB with the main app |
| `apps/mobile` | Metro 8081 | Expo app — sign-in/up, today's bookings, booking history + detail, workspace switcher, and the public booking flow with checkout. Uses `expo-secure-store` for token persistence |

### Routes (apps/web)

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/pricing` | Pricing with US ↔ India toggle |
| `/sign-in`, `/sign-up` | Auth flows |
| `/onboarding/{account,template,brand,locations,ready}` | 5-step wizard with sessionStorage cross-step state |
| `/dashboard` | Owner dashboard — today's bookings, metrics, staff |
| `/settings/branding` | Live theme customizer |
| `/settings/locations` | Create / edit / archive locations (timezone + currency per location) |
| `/settings/resources` | Staff/courts/rooms + per-day working hours |
| `/settings/services` | Service catalog (duration, price, eligible resources) |
| `/settings/team` | Invite teammates, manage members, revoke pending invites |
| `/settings/templates` | Switch profession template |
| `/settings/payments` | Stripe Connect onboarding, Cashfree Easy Split payout account, webhook setup |
| `/settings/invoicing` | Pick the invoice provider (built-in GST invoices, Zoho Books, FreshBooks or Stripe Invoicing), GST profile, auto-invoicing, CSV / Tally export |
| `/settings/notifications` | SMS / WhatsApp confirmation toggles and the WhatsApp templates reminders need |
| `/bookings` | Booking history — filter by status/resource/date, cancel/no-show/complete, refunds, invoices |
| `/customers` | CRM — customer list, search, detail with booking history + notes |
| `/accept-invitation/[id]` | Accept-invitation flow for invited teammates |
| `/api/upload/logo/presign` | Owner/admin POST — returns a presigned PUT URL for S3-compatible storage (type- and size-bound, PNG/JPEG/WebP only). The browser resizes the logo before uploading |
| `/api/payments/stripe/webhook` | Stripe webhook — verifies signature, confirms held bookings, records refunds, records / syncs invoices |
| `/api/integrations/freshbooks/callback` | FreshBooks OAuth redirect — stores encrypted tokens for the tenant |
| `/api/integrations/zoho/callback` | Zoho Books OAuth redirect (multi-data-centre aware) |
| `/api/export/invoices?format=csv\|tally&from&to` | Authed invoice export for the tenant's accountant — GST CSV or TallyPrime XML |
| `/invoice/[id]` | Public, printable built-in GST invoice / Bill of Supply |
| `/api/payments/cashfree/webhook` | Cashfree webhook — verifies HMAC + timestamp, confirms held bookings, records refunds |
| `/forgot-password`, `/reset-password`, `/verify-email` | Password reset + email verification flows |
| `/book/[orgSlug]/confirmation` | Post-payment confirmation (auto-refreshes until webhook lands) |
| `/book/[orgSlug]?layout=sidebar\|stacked\|inline` | Public tenant booking page (server-rendered with the tenant's theme) |
| `/api/auth/[...all]` | BetterAuth handler |
| `/api/trpc/[trpc]` | tRPC fetch adapter |
| `/api/health` | Health check (returns `{ ok, orgs }`, or `{ ok: false }` with 503) |
| `/settings/channels` | Booking channels — `?source=` share links (Google Business Profile, Instagram, WhatsApp) + bookings by source (30 days) |
| `/pay/[bookingId]` | Pay link from reminders — starts Stripe / Cashfree checkout for an unpaid booking |
| `/api/cron/reminders` | Hourly Vercel Cron (`apps/web/vercel.json`, `Authorization: Bearer $CRON_SECRET`) — WhatsApp/SMS reminders ~24h before confirmed bookings |
| `/api/notifications/whatsapp/inbound` | MSG91 inbound WhatsApp webhook (`?secret=$MSG91_WEBHOOK_SECRET`) — Confirm / Cancel / Reschedule button replies |
| `/settings/memberships` | Recurring membership plans (Cashfree Subscriptions) + subscribers, with cancel |
| `/book/[orgSlug]/memberships` | Public membership plans + sign-up (UPI Autopay / eNACH / card mandate) |
| `/book/[orgSlug]/memberships/authorize?sub=…` | Opens Cashfree's mandate-approval checkout for a pending sign-up (shareable / resumable) |
| `/book/[orgSlug]/memberships/return?sub=…` | Post-mandate landing — syncs status from Cashfree and auto-refreshes until settled |
| `/api/payments/cashfree/subscriptions/webhook` | Cashfree Subscriptions webhook — verifies HMAC, syncs mandate status, records debits idempotently |

### Memberships (Cashfree Subscriptions)

Tenants sell recurring packages ("₹2,000 / month"); the customer approves a UPI Autopay, eNACH or card mandate once and Cashfree debits them every cycle. It reuses the platform `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` / `CASHFREE_ENV` — no new env vars. Only INR plans can be sold.

- **Webhook:** in the Cashfree dashboard (Payment Gateway → Developers → Webhooks) add `https://<your-app>/api/payments/cashfree/subscriptions/webhook` for **Subscription** events (status changed, auth status, payment success / failed / cancelled). It's verified with `CASHFREE_CLIENT_SECRET`, same scheme as the PG webhook. Without it, statuses still sync when the customer lands on the return page, but recurring debits won't be recorded.
- **Plans are immutable at Cashfree.** A plan is created there lazily on its first subscriber, and mandates are approved for its exact amount, so price and interval are fixed once saved — only name / description / active can change. To re-price, create a new plan and deactivate the old one.
- **Sandbox testing:** leave `CASHFREE_ENV` unset (sandbox) and use sandbox keys. Create a plan in `/settings/memberships`, open `/book/<slug>/memberships`, subscribe with any email and a valid-format Indian mobile (e.g. `9999999999`), and approve the mandate on Cashfree's sandbox page (UPI test VPA `testsuccess@gocash`, or the sandbox net-banking / card simulators). Tunnel your dev server (e.g. `cloudflared` / `ngrok`) so the webhook can reach it.
- Code: `packages/api/src/memberships/*` (fetch-based client pinned to `x-api-version: 2026-01-01`, DB orchestration, webhook parsing) and `packages/api/src/router/membership.ts`.

---

## Requirements

- **Node.js** ≥ 20.10 (24.x tested)
- **pnpm** ≥ 9.15
- **A Neon Postgres database** (free tier works) — or any Postgres if you swap the driver
- For mobile dev: **Expo Go** on your phone, or **Xcode** / **Android Studio** for simulators
- Optional: **VS Code** with the *TypeScript Native Preview* extension (for `tsgo` in the editor)

---

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure env

Copy the example file and fill in your secrets:

```bash
cp .env.example .env
```

Required values:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Neon connection string (`postgres://…sslmode=require`) |
| `BETTER_AUTH_SECRET` | 32 bytes of random — generate with `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` for dev |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_URL` | `http://localhost:3000` |
| `EXPO_PUBLIC_AUTH_URL` | `http://localhost:3000` (mobile points at the web auth handler; on a device use your LAN IP) |

Everything else in `.env.example` is optional — payments, email/SMS, object storage, Sentry, Upstash — and each feature degrades gracefully when unset. See the comments in `.env.example`.

Optional — invoicing:

| Variable | What it is |
|---|---|
| `FRESHBOOKS_CLIENT_ID`, `FRESHBOOKS_CLIENT_SECRET` | FreshBooks OAuth app ([developer portal](https://my.freshbooks.com/#/developer)). Register the redirect URI `${NEXT_PUBLIC_APP_URL}/api/integrations/freshbooks/callback` — FreshBooks requires `https`, so use a tunnel (e.g. ngrok) in dev |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` | Zoho Books server-based OAuth client ([api-console.zoho.in](https://api-console.zoho.in)); redirect URI `${NEXT_PUBLIC_APP_URL}/api/integrations/zoho/callback`. Enable multi-DC to accept users outside India. `ZOHO_ACCOUNTS_URL` overrides the consent host (default `https://accounts.zoho.in`) |

Built-in **UdyamFlow GST invoices** need no env: set the GST profile on `/settings/invoicing` and each service's SAC code + GST slab on `/settings/services` (prices are GST-inclusive; exempt services and unregistered businesses get a Bill of Supply). Numbers run per financial year (`INV/26-27/0001`). **GST threshold:** GST can be charged only on bookings above a limit — UdyamFlow admins set the platform default and per-store overrides at `/gst` in the admin app (`:3001`), and stores can set their own on `/settings/invoicing` (store value wins; `0` = every transaction). Bookings at or below the limit get a Bill of Supply with a note. Registered businesses normally owe GST on every taxable sale, so stores should confirm with their CA.

Optional — Indian payouts (Cashfree Easy Split): tenants add their bank account / UPI ID on `/settings/payments`; once Cashfree marks the vendor `ACTIVE`, INR orders carry `order_splits` (and new memberships `subscription_payment_splits`) and settle to the tenant. Easy Split must be enabled on your Cashfree account. `CASHFREE_PLATFORM_FEE_PERCENT` (default `0`) keeps a share for the platform; `CASHFREE_REQUIRE_VENDOR=true` refuses INR checkouts for tenants without an active vendor.

Built-in Stripe Invoicing needs no extra env — it uses the tenant's Stripe Connect account. For invoice status sync, also subscribe the Stripe webhook (Connect events) to `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible` and `invoice.finalized`.

Optional — WhatsApp reminders & two-way replies:

| Variable | What it is |
|---|---|
| `CRON_SECRET` | Bearer token for `/api/cron/reminders` (set it in Vercel; Vercel Cron sends it automatically) |
| `MSG91_WEBHOOK_SECRET` | Shared secret for the MSG91 inbound webhook — configure `POST {APP_URL}/api/notifications/whatsapp/inbound?secret=…` in MSG91 |

WhatsApp templates to get approved on the MSG91 number (Utility, `en`): `booking_reminder` (body `{{1}}` name, `{{2}}` practitioner, `{{3}}` date/time, `{{4}}` join link or ref; quick replies Confirm / Cancel / Reschedule), `booking_reminder_pay` (same + URL button `{APP_URL}/pay/{{1}}`), and `booking_confirmed_online` (`booking_confirmed`'s four params + `{{5}}` join link).

The web/admin Next apps load this `.env` from the repo root via `@next/env`'s `loadEnvConfig` in `next.config.ts`. Drizzle and the seed script load it via `dotenv-cli`. No need to duplicate per-app.

### 3. Migrate and seed the database

```bash
pnpm db:migrate # new database: applies packages/db/migrations (incl. the overlap constraint)
# — or, for an existing database created with push —
pnpm db:push    # syncs the Drizzle schema, then applies db:constraints
pnpm db:seed    # inserts the three demo tenants (Patel Clinic, Kavya Tutor, Baseline Sports)
```

If `db:constraints` fails on an existing database, it already contains overlapping bookings (possible before this constraint existed): cancel the duplicates, then re-run `pnpm db:constraints`.

### Logo storage setup (optional)

Tenant logos go to any **S3-compatible** bucket — AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, Backblaze B2, Wasabi. Set the `STORAGE_*` variables (see `.env.example`):

- `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` — required.
- `STORAGE_ENDPOINT` — the provider's S3 endpoint; leave empty for AWS S3.
- `STORAGE_PUBLIC_URL` — where objects are publicly readable (a CDN, `r2.dev`, or the bucket URL). Derived automatically for AWS S3.
- `STORAGE_FORCE_PATH_STYLE=true` for MinIO and other path-style servers.

The browser uploads straight to the bucket with a 60-second presigned PUT (content type and exact size are signed in), so the bucket needs a CORS rule allowing `PUT` with a `Content-Type` header from your app's origin, and public read on the `tenant-logos/` prefix. Replaced logos are deleted automatically. The older `R2_*` variables keep working.

### Payments setup (optional)

- **Stripe** (non-INR prices): set `STRIPE_SECRET_KEY`, then create **two** webhook endpoints pointing at `/api/payments/stripe/webhook`:
  1. Platform events — `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded` → secret in `STRIPE_WEBHOOK_SECRET`.
  2. "Events on connected accounts" — the same events plus `account.updated` → secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.
- **Cashfree** (INR prices): set `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` for the platform account and point the webhook at `/api/payments/cashfree/webhook`. Tenants register a payout account (bank or UPI + KYC) in Settings → Payments; once Cashfree marks it `ACTIVE`, each INR order is split to them via **Easy Split** (`CASHFREE_PLATFORM_FEE_PERCENT` sets the platform's share).

### 4. Run

```bash
pnpm dev        # boots web (3000), admin (3001), mobile (Expo Metro 8081)
```

Or run a single app:

```bash
pnpm --filter @udyamflow/web dev
pnpm --filter @udyamflow/admin dev
pnpm --filter @udyamflow/mobile dev
```

### 5. Verify

```bash
curl http://localhost:3000/api/health   # → {"ok":true,"orgs":3}
```

Then visit:
- http://localhost:3000 — marketing
- http://localhost:3000/pricing
- http://localhost:3000/sign-up — create an account → onboarding → dashboard
- http://localhost:3000/book/patel-clinic — public booking page (try `?layout=stacked`, `?layout=inline`)
- http://localhost:3001 — admin sign-in

---

## Scripts

Run from the repo root unless noted.

| Script | What it does |
|---|---|
| `pnpm dev` | All apps in dev mode via Turbo |
| `pnpm build` | Production build of all buildable workspaces |
| `pnpm lint` | `biome check .` across the repo |
| `pnpm format` | `biome format --write .` |
| `pnpm check-types` | `tsgo --noEmit` across all typed workspaces |
| `pnpm test` | Vitest — unit tests plus API integration tests against in-process Postgres (PGlite) |
| `pnpm db:migrate` | Apply `packages/db/migrations` to `DATABASE_URL` |
| `pnpm db:push` | `drizzle-kit push` + `db:constraints` against `DATABASE_URL` |
| `pnpm db:constraints` | Apply constraints drizzle-kit can't express (booking overlap guard) |
| `pnpm db:generate` | Generate a migration file after a schema change |
| `pnpm db:seed` | Seed the three demo tenants |
| `pnpm clean` | Wipe build outputs + `node_modules` |

Per-workspace scripts (run with `pnpm --filter <name> <script>`):
- `dev` — workspace dev server
- `build` — workspace production build (apps only)
- `check-types` — `tsgo --noEmit` for that workspace

---

## Design system

The UI follows a **Linear / Notion-inspired** aesthetic — Inter for UI, Fraunces for italic accents, JetBrains Mono for tabular bits. The palette is a warm-slate neutral with one signature **accent color per tenant**.

Theming is driven by CSS variables, set at runtime by `<TenantThemeProvider>` (authed shell) or inline on the public booking page from the org's `tenant_settings` row (`tenantThemeToCssVars` in `packages/tokens`):

```css
--accent       /* tenant brand color */
--accent-soft  /* light tint of accent */
--accent-ink   /* dark variant for text on accent-soft backgrounds */
--accent-fg    /* text on the accent: white or ink, whichever has better contrast */
--radius       /* corner radius */
--font-display /* heading font */
--font-ui      /* body font */
```

What tenants can customize (Settings → Branding):

- **Logo** — image upload (PNG/JPEG/WebP, resized in the browser) or a 2–4 letter badge
- **Colors** — presets or any custom accent; the soft and ink shades are derived automatically (`deriveAccentPalette`) and can be overridden, with live WCAG contrast warnings (`paletteWarnings`)
- **Fonts** — heading and body font from a curated list (`FONT_OPTIONS`: Inter, DM Sans, Nunito, Space Grotesk, Fraunces, Playfair Display, Lora). Settings store the font **id**; `fontStack(id)` maps it to the `next/font` CSS variable, so every option actually loads
- **Corner radius** and **density**
- **Booking page** — default layout (sidebar / stacked / inline; `?layout=` still overrides), custom headline and intro text

Components in `packages/ui` (`Button`, `Input`, `Label`, `Card`, `TenantLogo`) read these vars instead of hardcoding colors, so switching workspaces repaints the whole authed shell instantly. The mobile booking flow gets the same brand from the public `tenant.publicBranding` query.

Three demo tenants ship with the seed:
- **Dr. Patel's Family Clinic** — teal `#0f766e`, profession: doctor
- **Kavya's Math Studio** — violet `#7c3aed`, profession: teacher (uses Fraunces display font)
- **Baseline Sports Club** — orange `#ea580c`, profession: sports

---

## Auth model

BetterAuth is shared across web, admin, and mobile via a single instance in `packages/auth/src/server.ts` (Drizzle adapter + organization plugin + Expo plugin).

- **Web / admin**: cookies + `better-auth/react` client
- **Mobile**: bearer tokens persisted in `expo-secure-store` via `@better-auth/expo`
- **Tenant scoping**: BetterAuth's organization plugin sets `session.activeOrganizationId`; the tRPC `tenantProcedure` middleware fails closed if it's missing
- **Roles**: `owner` / `admin` manage settings, catalog, team and payments; `member` can view everything and run the day (complete / no-show / cancel bookings, edit customer notes)
- **Admin gate**: `user.role === 'admin'` (a custom, server-only field on the BetterAuth `user` table) — enforced in the admin app layout and again in the `admin` tRPC router
- **Trusted origins**: `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_APP_URL`, `TRUSTED_ORIGINS` and the `udyamflow://` scheme

The flow on first sign-up:
1. `signUp.email` creates a user, no org yet
2. `apps/web/(app)/layout.tsx` detects `orgs.length === 0` and redirects to `/onboarding/account`
3. The 5-step wizard collects business + template + brand + locations (with timezone + currency) into `sessionStorage`
4. Step 4's "Create workspace" makes a single atomic `onboarding.createOrganization` call — org, owner membership, brand, locations, and the session's active org all commit together — then redirects to `/onboarding/ready`
5. From `/dashboard`, all subsequent tRPC calls flow through `tenantProcedure` and are scoped to the new org

---

## Project structure (full)

```
.
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (marketing)/        Landing + pricing
│   │   │   ├── (auth)/             Sign-in + sign-up
│   │   │   ├── (app)/              Authed shell — dashboard, settings, bookings
│   │   │   ├── onboarding/         5-step wizard
│   │   │   ├── book/[orgSlug]/     Public per-tenant booking page
│   │   │   └── api/                BetterAuth + tRPC + health route handlers
│   │   ├── components/             Marketing, onboarding, booking, app-shell
│   │   ├── lib/                    auth-server, theme, trpc/{react,server}
│   │   ├── proxy.ts                Next 16 proxy (replaces middleware) — auth gate
│   │   └── next.config.ts          loadEnvConfig from monorepo root
│   ├── admin/                      Same structure, smaller scope
│   └── mobile/
│       ├── app/                    expo-router file-based routes
│       │   ├── _layout.tsx
│       │   ├── index.tsx           Auth gate
│       │   ├── sign-in.tsx, sign-up.tsx
│       │   └── (app)/              Authed home
│       └── tailwind.config.js, metro.config.js, babel.config.js
├── packages/
│   ├── tokens/   src/{palette,tenants,professions,templates,density,css-vars}.ts
│   ├── storage/  src/{config,index}.ts — S3-compatible client, presigned uploads
│   ├── db/       src/schema/*.ts + client.ts + atomic.ts + constraints.ts + seed.ts, migrations/
│   ├── auth/     src/{server,client,expo-client,middleware}.ts
│   ├── api/      src/{trpc,index,notify,rate-limit,crypto}.ts + lib/ (time, slots, validate)
│   │             + payments/ (providers, lifecycle) + router/{auth,admin,tenant,onboarding,
│   │             location,resource,service,booking,customer,team,payment,report,notifications}.ts
│   ├── env/      src/{server,client}.ts
│   ├── notifications/ src/{email,sms,whatsapp}.ts
│   ├── ui/       src/{cn,styles.css}.ts + components/{button,input,label,card,logo,tenant-logo}.tsx
│   └── tsconfig/ {base,nextjs,react-library,expo}.json
├── tooling/
│   └── biome/    biome.json (extended by repo-root biome.json)
├── biome.json, turbo.json, pnpm-workspace.yaml, .env.example
└── README.md
```

---

## Not yet built

- **Subscription billing** for UdyamFlow itself (the free-6-months / per-location pricing on `/pricing`) — no plan, trial or invoicing code exists yet.
- Customer self-service rescheduling/cancellation links and appointment reminders.

---

## Company & legal

UdyamFlow is a product of **[Nextfly Technologies](https://nextflytech.com)**.

- 🔒 [Privacy Policy](https://udyamflow.com/legal/privacy)
- 📜 [Terms & Conditions](https://udyamflow.com/legal/terms)
- ↩️ [Cancellation Policy](https://udyamflow.com/legal/cancellation)

Built with love in India 🇮🇳 © [Nextfly Technologies](https://nextflytech.com). All rights reserved.

