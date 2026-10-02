# Capture provenance

These are actual Expo-web renders of the companion app, captured in isolated headless Chrome with Playwright against a disposable local PGlite database. They are responsive web reference/marketing images, not native App Store/Play screenshots or evidence of device QA.

Synthetic fixture only: Gurugram Wellness Studio, Sector 56, Asha Mehra, four invented appointments, and example.test email addresses. No real account, customer, payment, deletion or notification was used. Browser console showed a missing resource 404; no JavaScript runtime errors remained after the web-cookie fix.

Phone dashboard/history/account: 1080×1920 (360×640 at 3×). Booking detail: 1080×2220 (360×740 at 3×). Tablet dashboard: 3072×4098 (1024×1366 at 3×). Existing icon-derived outputs are 1024×1024 and 512×512; they contain no added copy.

Reproduction after installing the checked lockfile, from the repository root:

```sh
NODE_ENV=test BETTER_AUTH_SECRET=synthetic-preview-secret-longer-than-32-characters pnpm --filter @udyamflow/api exec tsx ../../docs/release-assets/preview-server.mts
CI=1 NODE_ENV=production EXPO_PUBLIC_AUTH_URL=http://localhost:3191 pnpm --filter @udyamflow/mobile exec expo start --web --port 8091 --max-workers 1 --no-dev --minify
```

The supplied preview server binds only 127.0.0.1, permits GET/OPTIONS only, and serves only the seven read procedures used in the captures plus synthetic auth session/list. Its database is in memory; no production driver, payment provider or mutation endpoint is exposed. Use a separate test shell without production provider values. Stop the processes after review.

## Email-code UI captures

Three phone images (`expo-web-phone-email-sign-in`, `email-sign-up`, `email-code`) are 1080×1920 at 360×640, 3×, from actual production Expo-web source `0508783`. All three were visually inspected. Signup content can scroll on short phones. Synthetic Asha Mehra/new-owner@example.test only; code input is empty and no token is visible. The UI flow passes the checks in `OTP-UI-verification.json`. These remain web reference images, not physical native screenshots.

`otp-preview-server.mts` is a separate localhost-only synthetic auth fixture; never deploy it. It exposes OTP retrieval only for its three allowlisted example.test recipients, runs migrated in-memory PGlite and strips provider values. `verify-otp-browser.mjs` uses separately installed Playwright-core and an isolated headless Chrome profile; it waits through a real 60-second resend cooldown. Start the auth fixture, then production Expo-web at localhost8091 with EXPO_PUBLIC_AUTH_URL=http://localhost:3191. Stop owned processes after review. No real email, deletion or booking mutation is performed by the browser fixture. Valid deletion link execution is tested only in the API handler suite.
