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
