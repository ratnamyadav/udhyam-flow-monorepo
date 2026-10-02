# UdyamFlow release readiness — 2 October 2026

Branch: `codex/release-readiness-20261002`. Initial checkout was clean, based on `f0d3660`. No production database changes, credentials creation, deployment, paid build, store submission or access changes were performed.

## Product and scope

UdyamFlow is a multi-tenant booking platform for business owners and staff, with guest customer booking. Profession presets: Doctors & Clinics; Teachers & Tutors; Sports Facilities; Salons & Spas; Therapists; Fitness Trainers. The web app includes onboarding, branding, location/resource/service catalog, team, bookings, CRM, payments, invoicing, memberships and booking channels. The Expo companion covers owner daily operation, booking history/detail, workspace switching and guest booking. The UI is English; no translated UI is promised.

Configured public URL: `https://udyamflow.com`. It **did not resolve from this Mac** during a fresh DNS/HTTP check. That is a release blocker; it is not proof of domain availability elsewhere. Production API, legal URLs, auth/deep links, webhook endpoints and support resources must be verified on the real deployment.

The pricing JSX advertises six free months, then ₹299/location/month in India or $10/location/month globally. Platform SaaS billing and trial entitlement enforcement are **not implemented**. A product decision between free beta and implementing the advertised plan is pending. No charging was added. Do not describe these terms as an operational billing system or invent limits, renewal terms or refunds. Tenant Cashfree membership plans and payments for booked services are separate features.

## Changes delivered

- Updated npm-verified stable web/API/storage/payment dependencies and lockfile: Next 16.3.8, web React 19.3.0, BetterAuth and Expo companion 1.7.7, tRPC 11.19.0, React Query 5.104.1, Drizzle 0.45.3, Zod 4.6.5, Sentry 11.4.0, Stripe 23.0.0, AWS SDK 3.1145.0, Biome 2.5.15 and Turbo 2.11.7, among others. Migrated Sentry 11 configuration entrypoint/options and Biome schema/preset.
- Web/mobile query clients are recreated by authenticated user and active workspace, preventing previous account/workspace data reuse. Workspace switching awaits session refresh; native tRPC awaits BetterAuth's newly asynchronous cookie API. Expo-web uses browser credentials instead of native-only SecureStore, fixing verified failing booking queries.
- Production auth requires a non-placeholder secret of at least 32 characters and HTTPS deployment origins. Email verification is required in production. Unconfigured production email fails rather than logging verification links and claiming delivery. Google sign-in is advertised only when both credentials exist.
- Verified-email personal account deletion is enabled through BetterAuth, available from mobile Settings and `/account`; `/account-deletion` provides a public request resource. Ownership must be transferred and owner memberships left first. Workspace business records remain with their business. Login/session/account/member records cascade when personal accounts are deleted; business-controller retention still requires accurate published policy and a process for customer data requests.
- Confirmation emails contain purpose-bound HMAC booking management links. `/manage-booking` supports customer cancellation and same-provider/service rescheduling before the original appointment starts. Booking ID, short reference and status URL alone cannot authorize changes. Token tampering, cross-booking substitution, expiry and missing strong signing secret are rejected. Changes preserve original duration and price snapshots; database overlap exclusion and compare-and-set protect races. Pending-payment holds cannot be rescheduled. Cancellation does not promise automatic refunds.
- Calendar date validation rejects impossible dates. Mobile no longer displays successful booking when status is unavailable. Web confirmation resolves expired holds, acknowledges possible late payment, and distinguishes partial/full refunds; mobile partial-refund copy agrees.
- Production tRPC debug logging is disabled. Web/admin diagnostic events scrub account identity, bodies, cookies, authorization/API-key headers and request queries/fragments; session replay is disabled. A regression test covers customer intake and signed-link removal.
- Mobile release config declares Android AAB production output, a simulator profile and OS/HTTPS-only exempt encryption usage. Unconfigured tab placeholder arrows were replaced by clear text navigation. Expo-generated route types are included; the confirmation navigation now uses a typed pathname/params object.
- Test storage deletion is mocked so tenant-logo authorization coverage does not contact external S3 with dummy credentials. Database tests use one worker and a longer setup timeout for disposable PGlite initialization on this heavily loaded Mac.

## Compatibility holds

Expo 57.0.26 and its bundled RN 0.86.3, native React/React DOM 19.2.3, native React types 19.2 and native module versions remain coherent with Expo's own metadata. Standalone RN 0.87.1 and web React 19.3 are not substituted into that native renderer. `expo install --check` passes.

TypeScript 6.0.3 remains the Next/tooling compiler API; npm TypeScript 7.0.2 exports a new unstable API instead of the legacy compiler API. The latest available native-preview compiler is used separately for fast checks. NativeWind remains the project's Tailwind-v4 v5 preview: stable NativeWind 4 targets a different styling architecture; the newer v5 release candidate requires pre-release react-native-css. This preview dependency remains a release risk requiring native visual QA. Vitest 4.1.11 is the supported runner on the installed Node 25; latest Vitest 5 requires Node 22/24/26 LTS ranges and excludes Node 25. Use Node 24 LTS for release/build hosts. pnpm 9.15.0 is held for parity with the existing verified lockfile/install and EAS recipe; npm latest pnpm 12.8.1 is a separate installer migration, not represented as completed.

## Verification

| Check | Actual result |
|---|---|
| Initial typechecks | PASS — 11 workspace tasks |
| Initial tests | PASS — 179 API + 8 storage tests |
| Updated full tests | PASS — final 186 API + 8 storage = 194 tests; 16 API suites plus storage; disposable PGlite includes new auth migration |
| Updated serial typechecks | PASS — final serial run: all 11 tasks; mobile rechecked after final tab presentation fix |
| Expo compatibility | PASS — `expo install --check` |
| Lint | PASS — final Biome check: 330 files |
| Web production build | PASS — final Next emitted all expected static/dynamic routes using synthetic build env; see auth schema note below |
| Admin production build | PASS — final Next compiled, typechecked and emitted routes; see auth schema note below |
| iOS production Hermes export | PASS — final 1944 modules; `/tmp/udyamflow-ios-release-export`, 4.7 MB bundle |
| Android production Hermes export | PASS — final 2037 modules; 4.9 MB bundle |
| Native simulator/device interaction | BLOCKED — official Expo Go downloaded, but simulator install/launch/query calls stalled; native UI pipe unavailable. Own stalled commands stopped. No simulator reset/security changes. |
| Responsive actual-app web captures | PASS — five actual production-mode Expo-web PNGs; synthetic data; visually checked; web reference, not native store screenshots |
| Production providers/database | NOT RUN — credentials/account access and production writes intentionally excluded |
| Signing, archive/AAB, TestFlight/Play upload | NOT RUN |

The first upgraded test attempt failed only because five database setup hooks exceeded the old 10-second limit under resource contention; the full rerun passed. Upgraded typechecks surfaced and fixed Sentry 11 import changes, asynchronous Expo cookie headers and generated typed-route navigation. Temporary missing Expo type resolution occurred during dependency relinking and was resolved by checking after install completed.

## Environment and account requirements

Names only; never paste values into this report or store screenshots.

Required server deployment: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_URL`. Native release API: `EXPO_PUBLIC_AUTH_URL` (production profile currently sets the configured public HTTPS origin). Admin: `ADMIN_APP_URL`, optionally `TRUSTED_ORIGINS`.

Production email/account lifecycle: `RESEND_API_KEY`, `EMAIL_FROM`; verify sender domain and delivery/reset/verification/deletion callbacks. Optional Google auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Native Google-login/device flows remain manual QA.

Booked-service payments: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`; or `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV`, `CASHFREE_REQUIRE_VENDOR`, `CASHFREE_PLATFORM_FEE_PERCENT`. Confirm Connect/Easy Split KYC, currency routing, real sandbox checkout/webhook retries and refunds before launch.

Notifications/reminders: `MSG91_AUTH_KEY`, `MSG91_SMS_SENDER`, `MSG91_SMS_TEMPLATE_ID`, `MSG91_SMS_CANCEL_TEMPLATE_ID`, `MSG91_WHATSAPP_INTEGRATED_NUMBER`, `MSG91_WEBHOOK_SECRET`, `CRON_SECRET`. Approved WhatsApp/DLT templates, signed webhook validation and scheduler delivery require actual account QA.

Logo storage: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_URL`, `STORAGE_FORCE_PATH_STYLE`. Confirm CORS, signed upload/size restrictions and public logo URLs. Optional distributed limits: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TRUSTED_IP_HEADER`. Set an edge-controlled IP header and a shared rate-limit backend for multi-instance production.

Optional accounting: `FRESHBOOKS_CLIENT_ID`, `FRESHBOOKS_CLIENT_SECRET`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_ACCOUNTS_URL`, `ENCRYPTION_KEY`, `ENCRYPTION_KEY_PREVIOUS`. Optional diagnostics: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`; source-map release account fields `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` require explicit release configuration.

## Store release gates and privacy facts

- This Mac has Xcode 27.0 (27A266a). App config targets Android compile/target API 36; Expo SDK 57's iOS deployment target is 16.4+. Actual regenerated native manifests, privacy manifests, signed archive and AAB have not been verified. Apple currently requires Xcode/SDK 26 or newer; Google's current new-app/update requirement is target API 36. Recheck official requirements before submission: https://developer.apple.com/news/upcoming-requirements/ and https://support.google.com/googleplay/android-developer/answer/11926878 .
- Apple Developer/App Store Connect membership/team, bundle ID availability (`com.udyamflow.app`), signing/provisioning and reviewer access are required. Google Play developer account/package ownership, upload key/Play App Signing, testing requirements, content rating and declarations remain human/account gates. No credentials were created.
- Booked real-world services and platform digital SaaS subscriptions require different payment-policy analysis. Remote sessions/classes and tenant memberships need precise service classification. No native external digital subscription checkout was added. Resolve billing/product choice and store applicability before implementing paid SaaS access.
- Data actually handled: owner name/email/auth credentials and memberships; booking customer name/email/phone/intake; booking status/times/prices; customer notes; business branding/catalog; provider payment identifiers/status and invoices. Customer intake may contain sensitive user-supplied content depending on profession. Do not claim that no data is collected or that deletion erases all business records.
- Native direct SDKs: BetterAuth plus Expo SecureStore for session cookies; secure OS storage and HTTPS transport. No native advertising, analytics or native Sentry SDK was found. The app calls its shared server and opens external auth/payment/session URLs in browser. Verify configured providers and actual final binary.
- Server/service processors when configured: Neon/Postgres, Resend email, MSG91 SMS/WhatsApp, S3-compatible logo storage, Stripe/Cashfree payments/memberships, optional Zoho/FreshBooks and Upstash. Web/admin additionally use Sentry errors/traces when DSNs are configured, with the added scrubber. Store disclosure answers depend on the actual enabled deployment and controller/processor agreements; forms were not submitted.
- Public privacy/terms/cancellation URLs are referenced as `/legal/privacy`, `/legal/terms`, `/legal/cancellation` on the configured domain. No local legal page files were found. Confirm these resources and support/contact ownership, retention periods and deletion request handling before release.

## Assets and capture provenance

`docs/release-assets/app-store-icon-1024.png` and `play-store-icon-512.png` derive from the existing `apps/mobile/assets/icon.png`, preserving its teal/ink circular mark. Do not treat these as new brand approval. Original icon, adaptive foreground and splash assets are all 1024 square.

Target native captures after simulator/device recovery: real iPhone at 1320×2868; supported iPad at 2064×2752 or 2048×2732; Android at 1080×1920. Capture daily dashboard, history, booking detail, workspace/settings and public booking with synthetic records. Do not capture customer secrets, real appointments, development error overlays or fabricate screens. Expo-web captures are useful only for responsive web marketing/reference until native runtime verification.

## Remaining functional/product work

Platform subscription/trial entitlement remains pending product confirmation. Native device behavior, Google OAuth, deep-link association files, screen-reader/navigation, background/network interruptions, tablet/foldable resizing, actual gateway sandbox behavior, production notification delivery and diagnostics scrubbing in deployed SDK paths need manual/integration QA. Current API tests cover tenant isolation, roles, overlap prevention, timezone slots, booking transitions, payment holds/idempotency/refunds, GST/invoices, memberships, WhatsApp formats/rate limits and the new security flows; they do not certify external accounts or store approval.

Play developer account: the user confirmed on 2026-10-02 that the prior organization-verification restriction was resolved in Play Console. App-specific signing, testing and submission checks remain unverified. Cashfree merchant activation emails naming Udhyamflow do not establish recurring mandates, collections readiness or authorization to reuse merchant credentials.

## Prepared migration

Final web/admin builds exited successfully but the upgraded BetterAuth adapter reported that `invitation.createdAt` was missing. Added `createdAt` to Drizzle and generated `packages/db/migrations/0004_auth-invitation-created-at.sql` plus journal/snapshot **offline**: `ALTER TABLE "invitation" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;`. The existing rows receive the migration-time default; original historical invitation creation times are not recoverable from this change. This migration has NOT been applied to any live database. A release deployment must review its schema/backfill/locking implications and apply it through an authorized deployment before upgrading the server. Final full tests passed 194/194 using fresh migrated PGlite databases. Final serial typechecks passed all 11 tasks and Biome checked 330 files. Fresh production-mode BetterAuth `$context` initialization with synthetic configuration passed without schema-mismatch diagnostics and without database queries. The Next builds above preceded the additive schema fix; deployment must build against the complete committed change and migrate its database before serving the upgraded adapter. Native exports include final cookie/navigation changes.
