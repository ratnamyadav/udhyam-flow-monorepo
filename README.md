# UdyamFlow

A multi-tenant **booking SaaS** that adapts to whoever's taking bookings — doctors, tutors, sports facilities, salons, therapists, fitness trainers. Tenants pick a profession template, recolor it to match their brand, add their locations, and they're taking bookings the same afternoon.

Pricing: **free for the first 6 months**, then per-location:
- 🌐 **Global** — ~~$50~~ → **$10** / location / month
- 🇮🇳 **India** — ~~₹1,000~~ → **₹299** / location / month

---

## Architecture

A pnpm + Turborepo monorepo with three apps and five shared packages.

```
udhyam-flow/
├── apps/
│   ├── web/        Next.js 16 — UdyamFlow tenant-facing SaaS (full design)
│   ├── admin/      Next.js 16 — internal admin panel (auth-only)
│   └── mobile/     Expo SDK 55 + expo-router — mobile app (auth-only)
├── packages/
│   ├── auth/       BetterAuth server + web client + Expo client
│   ├── db/         Drizzle ORM schema + Neon Postgres client + seed
│   ├── api/        tRPC v11 routers + tenant middleware
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
- **Booking** — `location`, `resource`, `booking`

Multi-tenancy is **shared DB, scoped by `organization_id`** on every tenant table. The tRPC `tenantProcedure` middleware reads the active org from the session (BetterAuth's `activeOrganizationId`) and scopes all queries to it.

### App responsibilities

| App | Port | Responsibilities |
|---|---|---|
| `apps/web` | 3000 | Marketing landing, pricing, sign-in/up, 5-step onboarding wizard, owner dashboard, theme customizer with live preview, three booking layouts (sidebar/stacked/inline), multi-tenant location switcher |
| `apps/admin` | 3001 | Internal staff panel — sign-in + dashboard placeholder gated by `user.role === 'admin'`. Shares the BetterAuth session DB with the main app |
| `apps/mobile` | Metro 8081 | Expo app, currently auth-only — sign-in / sign-up / authed home with sign-out. Uses `expo-secure-store` for token persistence |

### Routes (apps/web)

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/pricing` | Pricing with US ↔ India toggle |
| `/sign-in`, `/sign-up` | Auth flows |
| `/onboarding/{account,template,brand,locations,ready}` | 5-step wizard with sessionStorage cross-step state |
| `/dashboard` | Owner dashboard — today's bookings, metrics, staff |
| `/settings/branding` | Live theme customizer |
| `/settings/locations` | CRUD for locations |
| `/settings/templates` | Switch profession template |
| `/bookings` | Booking history (placeholder) |
| `/book/[orgSlug]?layout=sidebar\|stacked\|inline` | Public tenant booking page (server-rendered with the tenant's theme) |
| `/api/auth/[...all]` | BetterAuth handler |
| `/api/trpc/[trpc]` | tRPC fetch adapter |
| `/api/health` | Health check (returns `{ ok, orgs }`) |

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
| `EXPO_PUBLIC_AUTH_URL` | `http://localhost:3000` (mobile points at the web auth handler) |

The web/admin Next apps load this `.env` from the repo root via `@next/env`'s `loadEnvConfig` in `next.config.ts`. Drizzle and the seed script load it via `dotenv-cli`. No need to duplicate per-app.

### 3. Migrate and seed the database

```bash
pnpm db:push    # applies the Drizzle schema to your Neon DB
pnpm db:seed    # inserts the three demo tenants (Patel Clinic, Kavya Tutor, Baseline Sports)
```

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
| `pnpm check-types` | `tsgo --noEmit` across all 8 typed workspaces |
| `pnpm db:push` | `drizzle-kit push` against `DATABASE_URL` |
| `pnpm db:generate` | Generate a migration file |
| `pnpm db:seed` | Seed the three demo tenants |
| `pnpm clean` | Wipe build outputs + `node_modules` |

Per-workspace scripts (run with `pnpm --filter <name> <script>`):
- `dev` — workspace dev server
- `build` — workspace production build (apps only)
- `check-types` — `tsgo --noEmit` for that workspace

---

## Design system

The UI follows a **Linear / Notion-inspired** aesthetic — Inter for UI, Fraunces for italic accents, JetBrains Mono for tabular bits. The palette is a warm-slate neutral with one signature **accent color per tenant**.

Theming is driven by CSS variables on `<html>`, set at runtime by `<TenantThemeProvider>` from the active org's `tenant_settings` row:

```css
--accent       /* tenant brand color */
--accent-soft  /* light tint of accent */
--accent-ink   /* dark variant for text on accent backgrounds */
--radius       /* corner radius */
--font-display /* heading font */
```

Components in `packages/ui` (`Button`, `Input`, `Label`, `Card`, `TenantLogo`) read these vars instead of hardcoding colors, so swapping tenants in the location-switcher repaints the whole authed shell instantly.

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
- **Admin gate**: `user.role === 'admin'` (a custom field on the BetterAuth `user` table)

The flow on first sign-up:
1. `signUp.email` creates a user, no org yet
2. `apps/web/(app)/layout.tsx` detects `orgs.length === 0` and redirects to `/onboarding/account`
3. The 5-step wizard collects business + template + brand + locations into `sessionStorage`
4. Step 4's "Create workspace" calls `onboarding.createOrganization` → `authClient.organization.setActive` → `tenant.updateSettings(brand)` → `location.create` per location, then redirects to `/onboarding/ready`
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
│   ├── db/       src/schema/{auth,org,tenant,location,resource,booking}.ts + client.ts + seed.ts
│   ├── auth/     src/{server,client,expo-client,middleware}.ts
│   ├── api/      src/{trpc,index}.ts + router/{auth,tenant,onboarding,location,resource,booking}.ts
│   ├── ui/       src/{cn,styles.css}.ts + components/{button,input,label,card,logo,tenant-logo}.tsx
│   └── tsconfig/ {base,nextjs,react-library,expo}.json
├── tooling/
│   └── biome/    biome.json (extended by repo-root biome.json)
├── biome.json, turbo.json, pnpm-workspace.yaml, .env.example
└── README.md
```
