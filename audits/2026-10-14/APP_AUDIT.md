# UdyamFlow application audit

The implementation has a substantial working foundation, but it is not ready for production payment traffic. Eight high priority defects affect payment correctness, refunds, financial permissions, and workspace data. Eight additional defects affect invoices, booking recovery, notifications, configuration, timezones, and responsive layouts. The advertised SaaS billing and membership booking benefits also need implementation.

Reviewed on 14 October 2026 against commit `f0d3660`. Scope covered the web, admin, and mobile applications; shared authentication and tenant authorization; all API router domains; database schema and migrations; booking and payment lifecycles; invoicing and accounting exports; memberships; notifications; storage; environment handling; CI; and Android build configuration. Application source was not changed. The audit evidence is saved beside this report.

## Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| Existing automated tests | 187 passed across 16 test files, comprising 179 API tests and 8 storage tests | [Test output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/tests.log) |
| Type checks | Passed in all 11 packages with a type check script | [Type check output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/types.log) |
| Targeted bug reproductions | 10 passed, asserting the current defective behavior rather than successful fixes | [Reproduction output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/reproductions.log) |
| Web production build | Passed using `next build --webpack` and dummy environment values | [Web build output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/web-build.log) |
| Admin production build | Passed using `next build --webpack` and dummy environment values | [Admin build output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/admin-build.log) |
| Default Turbopack build | Unverified because compiler subprocesses could not bind a port in this environment; the initial sandboxed attempt also could not fetch Google Fonts | [Default build output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/turbopack-build.log) |
| Android JavaScript bundle | Expo export passed | [Android bundle output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/android-bundle.log) |
| Expo dependency compatibility | Local bundled version map reported dependencies up to date; Expo marked offline validation as unreliable | [Expo version output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/expo-versions.log) |
| Lint and formatting | Failed on formatting in `apps/mobile/app.json`; one error, no fixes applied | [Lint output](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/lint.log) |
| Browser inspection | Landing, pricing, sign in, and sign up screens inspected locally; landing and pricing overflow at a phone viewport | Screenshots under finding 16 |
| Bulk dependency vulnerability scan | Not run. Automatic approval review rejected sending the dependency metadata to npm because it might disclose private package information | Requires explicit approval for that transmission |

The runtime used Node 26.8.2 and the repository's pinned pnpm 9.15.0. Dependencies were installed with lifecycle scripts disabled. Database tests used the existing PGlite harness with production migrations and the overlap constraint. There was no configured live database or provider account, so authenticated browser workflows, real Stripe/Cashfree/MSG91/OAuth deliveries, native APK installation, iOS builds, and deployed infrastructure remain unverified. Successful JavaScript export does not establish that an EAS native build succeeds.

## High priority findings

### 1 Cancelled bookings can be restored by a payment webhook

**P1.** [Payment lifecycle](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/payments/lifecycle.ts:51) reads the booking status, then confirms it with a predicate that checks only the payment status. If staff cancel the booking between those operations, payment success overwrites the cancellation with `confirmed`. A deterministic reproduction used real SQL to cancel immediately before the confirmation update and observed the booking return to `confirmed`.

Include the permitted current booking statuses in the update predicate. When the status has changed, record the captured money without restoring the booking and return the appropriate refund outcome.

### 2 Refund totals can lose completed refunds

**P1.** [Refund total updates](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/payments/lifecycle.ts:129) calculate a maximum from an earlier read and then write it unconditionally. The reproduction inserted a concurrent total of 2,000 minor units before a stale webhook update; the final total fell to 1,000. [Manual refunds](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/payments/lifecycle.ts:251) similarly add to the caller's stale booking snapshot. Two successful Stripe partial refunds can therefore leave the database recording only one.

Maintain a refund ledger with unique provider refund IDs and reserved amounts. Calculate cumulative totals atomically in SQL and make each external refund operation idempotent.

### 3 Checkout retries can create multiple collectible payments

**P1.** [Cashfree checkout](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/router/payment.ts:219) creates a new order on every retry without reusing or terminating the previous order. The reproduction observed two different order IDs for the same held booking. Stripe session reuse also has no lock or idempotency key around concurrent first requests. Payment updates check booking status but do not check whether another request has already settled it.

Both orders or sessions can remain payable. After the first success, `markBookingPaid` returns `already_settled` for another payment and neither webhook handler arranges a refund of that additional charge. Track individual checkout attempts, serialize their creation, reuse active attempts, and reconcile every captured transaction.

### 4 Cashfree refund IDs repeat for a booking

**P1.** [Refund ID generation](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/cashfree.ts:156) truncates `rfd_<orderId>_<timestamp>` to 40 characters. A production booking ID is already 40 characters, so the timestamp and attempt suffix are removed. Two refund requests at different timestamps reproduced exactly the same ID. This prevents independent partial refunds from having distinct gateway identifiers.

Generate a compact unique refund ID first and persist it before the request. Cashfree documents a unique refund ID of 3–40 characters and a separate idempotency key. [Cashfree Create Refund](https://www.cashfree.com/docs/api-reference/payments/latest/refunds/create-refund).

### 5 Initiating a refund is treated as completing it

**P1.** [Cashfree refund requests](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/cashfree.ts:151) discard the provider response. [The refund lifecycle](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/payments/lifecycle.ts:251) immediately records refunded money and final payment status. A mocked `PENDING` response reproduced a locally fully refunded booking. Later rejection has no path to restore the balance because the webhook processes only refund success.

Record requested, pending, successful, and failed refunds separately, updating the completed total only when the provider confirms completion. Cashfree explicitly documents pending, approval, cancelled, on-hold, and rejected responses as well as success. [Cashfree refund states](https://www.cashfree.com/docs/api-reference/payments/latest/refunds/create-refund).

### 6 Invoices use edited catalog prices instead of booking prices

**P1.** [Invoice creation](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/invoicing/issue.ts:251) uses the current service price and currency for the invoice, tax calculation, and provider draft. A booking saved at 2,500 minor units produced an invoice for 9,000 after the service price changed. Changing a paid service to free also makes its earlier paid bookings fail the “nothing to invoice” guard.

Use `booking.amountCents` and `booking.currency`, falling back to the catalog only for legacy rows lacking snapshots. Snapshot other invoice facts that must remain stable after catalog edits.

### 7 Members can change membership financial settings

**P1.** [Membership plan creation](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/router/membership.ts:68), plan updates, and [subscription cancellation](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/router/membership.ts:152) use `tenantProcedure`, which permits ordinary members. The rest of the catalog and payment settings enforce owner/admin access. A member caller successfully created a priced membership plan in the reproduction. The cancellation path also permits the member to stop recurring customer billing.

Use `tenantAdminProcedure` for these mutations and apply the same role restriction to their UI controls. Invoice issuance also currently allows ordinary members; document that permission explicitly if it is intentional.

### 8 Web workspace changes retain the previous query cache

**P1.** [The workspace switcher](/home/nextfly001/Work/udhyam-flow-monorepo/apps/web/components/app-shell/topbar.tsx:48) updates the session and calls `router.refresh()`. [The query provider](/home/nextfly001/Work/udhyam-flow-monorepo/apps/web/lib/trpc/react.tsx:18) lives in the root layout and retains its `QueryClient`. Tenant query keys contain procedure inputs rather than an organization ID. Refreshing server components therefore leaves mounted client queries displaying the previous workspace's customers, bookings, settings, and role. The web sign-out path also leaves that cache intact.

Cancel in-flight tenant queries and replace or clear the cache on workspace and user changes, or scope the provider and query keys to those identities. This is a client cache defect; the reviewed server middleware still scopes access to a verified membership.

## Additional implementation defects

### 9 The API accepts currencies with incompatible amount handling

**P2.** [Currency validation](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/lib/validate.ts:21) accepts every three-letter code. Prices are [displayed divided by 100](/home/nextfly001/Work/udhyam-flow-monorepo/apps/web/components/booking/booking-interface.tsx:64), but [Stripe receives the stored integer directly](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/router/payment.ts:179). An API-created JPY service storing 2,500 would display approximately ¥25 while Stripe charges ¥2,500. The current web editor exposes only INR/USD/EUR/GBP, so this defect applies to other currencies created through the API or existing data.

Restrict the API to the supported currencies or use currency-specific minor units consistently. Stripe documents JPY as a zero-decimal currency. [Stripe currency amounts](https://docs.stripe.com/currencies).

### 10 Web checkout recovery abandons the existing held booking

**P2.** [The booking component](/home/nextfly001/Work/udhyam-flow-monorepo/apps/web/components/booking/booking-interface.tsx:177) shows a retry error after checkout creation fails, but does not retain a usable payment action for the booking ID. Clicking Confirm again calls `booking.create`, which conflicts with the customer's own held slot. [Failed or cancelled checkout confirmation](/home/nextfly001/Work/udhyam-flow-monorepo/apps/web/app/book/[orgSlug]/confirmation/page.tsx:197) similarly links back to the booking picker while the original hold remains active.

Offer checkout retry through `/pay/<bookingId>` or `payment.createCheckout` for that existing booking. Make releasing the hold a separate deliberate action when the customer abandons it.

### 11 Built-in invoices stay unpaid after later payment

**P2.** [Invoice reuse](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/invoicing/issue.ts:191) returns an existing invoice without updating its payment status. Issuing a built-in invoice before payment, then marking the booking paid and running auto-invoicing, reproduced an invoice still marked `open`. The public invoice continues to say “Payment due.”

Synchronize an existing built-in invoice when its booking is paid. Define equivalent reconciliation for external accounting invoices issued before checkout.

### 12 SMS reminders use the confirmation template

**P2.** [Reminder sending](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/whatsapp/run-reminders.ts:119) supplies reminder text but no dedicated template ID. [The SMS adapter](/home/nextfly001/Work/udhyam-flow-monorepo/packages/notifications/src/sms.ts:29) defaults to the booking confirmation template and does not send the supplied `body` to MSG91. The actual template message is therefore the confirmation, and reminder-specific payment, meeting, and rebooking information is not guaranteed to be present.

Add a dedicated approved reminder template and configuration value, pass its ID explicitly, and validate the outgoing request against that template.

### 13 The example environment fails optional field validation

**P2.** [The environment schema](/home/nextfly001/Work/udhyam-flow-monorepo/packages/env/src/server.ts:28) treats optional keys as absent or valid values, while `.env.example` sets several of them to empty strings. `ENCRYPTION_KEY`, storage URLs, and the Upstash URL fail validation even after the required values have been filled in. Parsing the example reproduced the failure. Development startup throws in both Next configurations; production catches the error and continues instead of providing the documented fail-fast behavior.

Normalize empty optional environment values to `undefined` before validation, and separate any build-time exception from runtime validation.

### 14 DST transitions produce duplicate or incorrect slot labels

**P2.** [Slot generation](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/lib/slots.ts:28) converts each wall-clock minute without checking whether that local time exists. A New York schedule from 01:00 to 04:00 on 8 March 2026 reproduced duplicate UTC starts and labels that disagree with the actual local start time. Fall-back repeated hours are also not represented explicitly. Existing DST tests cover day length rather than slot generation.

Validate the round trip from local time to UTC and back, omit nonexistent times, and define how repeated local times are shown and selected.

### 15 Mobile today combines locations using one timezone

**P2.** [The today query](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/router/booking.ts:447) derives the day window and timezone from the first location when no location is supplied, but [does not filter to that location](/home/nextfly001/Work/udhyam-flow-monorepo/packages/api/src/router/booking.ts:464). [The mobile dashboard](/home/nextfly001/Work/udhyam-flow-monorepo/apps/mobile/app/(app)/index.tsx:16) makes precisely that query and formats all bookings in the returned timezone. Tenants with branches in different zones see appointments grouped under the wrong local day or displayed at misleading local times.

Either query a selected location, or calculate each location's local day and return its timezone on every booking row.

### 16 Major web screens overflow on phones

**P2.** At a 390px browser viewport, the landing page had a 375px content viewport and a 1,001px document scroll width; pricing had a 375px content viewport and a 723px document scroll width. Headings were visibly cropped, and navigation controls extended off-screen. Sign up fit the viewport.

The causes include [fixed marketing navigation spacing](/home/nextfly001/Work/udhyam-flow-monorepo/apps/web/components/marketing/marketing-nav.tsx:15), [84px hero text](/home/nextfly001/Work/udhyam-flow-monorepo/apps/web/app/(marketing)/page.tsx:39), and [76px pricing text](/home/nextfly001/Work/udhyam-flow-monorepo/apps/web/app/(marketing)/pricing/page.tsx:31). Source review also found fixed desktop grids in the owner dashboard, branding, catalog settings, and onboarding.

Add phone breakpoints for typography, padding, navigation, and stacked content grids. Verify public booking, onboarding, and owner tasks at 320/390/768px as well as desktop sizes.

[Landing screenshot](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/home-mobile.png) · [Pricing screenshot](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/pricing-mobile.png).

## Product implementation gaps

- **SaaS subscription billing:** the advertised six-month free trial followed by per-location billing has no tenant subscription/trial schema, billing checkout, location billing reconciliation, or enforcement path in this repository. The Cashfree membership feature bills a tenant's customers; it does not implement the platform's own SaaS pricing.
- **Membership booking benefits:** `sessionsPerCycle` is saved and displayed, but booking creation does not check an active membership, consume session credits, prevent overuse, or apply membership pricing. The recurring debit implementation therefore does not fulfill a plan advertising included booking sessions without an external manual process.
- **Marketing claims exceed the implementation:** the site advertises custom domains, an audit log, recurring lessons, group classes, equipment rental, peak pricing, deposits, insurance/intake fields, URL palette extraction, and SVG logo upload. Corresponding application flows are absent in the reviewed repository; SVG uploads are explicitly rejected. Implement those capabilities or narrow the copy. No claim is made about services implemented outside this repository.

## Working safeguards

The reviewed tenant middleware rechecks membership, including stale active organizations, and scopes protected queries to the resolved organization. Platform staff procedures and actions enforce the server-only admin role. Catalog mutations check ownership of referenced locations/resources/services. Production migrations include the Postgres exclusion constraint that prevents overlapping bookings; the existing tests exercise it. Payment webhook signature verification, encrypted integration tokens, OAuth user binding and host checks, scoped logo URLs, and escaped CSV/XML output provide useful foundations.

These safeguards do not resolve the lifecycle and cache defects above. No new server tenant-isolation bypass was identified in the reviewed paths, but this audit is not a deployed penetration test.

## Reproduction evidence and repair order

The ten targeted checks cover invoice price drift, member financial writes, repeating Cashfree refund IDs, pending refunds recorded as completed, example environment validation, cancellation races, refund total races, invoice payment synchronization, DST slots, and repeated Cashfree checkout creation. Their exact source is preserved as [reproduction.test.ts.txt](/home/nextfly001/Work/udhyam-flow-monorepo/audits/2026-10-14/reproduction.test.ts.txt). To rerun them, copy that file to `packages/api/test/audit-reproduction.test.ts`, run `pnpm --filter @udyamflow/api exec vitest run test/audit-reproduction.test.ts`, and remove the temporary test afterward. Passing these checks confirms the defects still exist; they must be inverted into regression tests when the implementation is repaired.

Fix findings 1–8 before accepting production payments or relying on financial reports. Then address checkout recovery and invoice synchronization, complete the billing/entitlement features required by the product, and repair the phone layouts and configuration. Add integration coverage for multiple checkout attempts, asynchronous refunds, role restrictions, workspace/user cache changes, and DST slot schedules. Correct the mobile JSON formatting so the current CI lint gate passes.
