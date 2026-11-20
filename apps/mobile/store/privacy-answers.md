# Store privacy answers — UdyamFlow

What the app and its backend actually collect, mapped to Apple's App Privacy
questions and Google Play's Data safety form. Re-check this whenever a new SDK
or data field is added. Source of truth: `/legal/privacy`.

The app has no analytics, advertising or tracking SDKs. Card, UPI and bank
details are entered on Stripe's or Cashfree's own payment page (opened in the
browser) and never reach UdyamFlow.

## Apple — App Store Connect → App Privacy

**Do you or your third-party partners collect data from this app?** Yes.
**Is any data used to track users?** No (no tracking, no ATT prompt needed).

| Data type | Collected | Linked to the user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact info → Name | Yes | Yes | No | App functionality |
| Contact info → Email address | Yes | Yes | No | App functionality |
| Contact info → Phone number | Yes | Yes | No | App functionality |
| Identifiers → User ID | Yes | Yes | No | App functionality |
| Purchases → Purchase history | Yes | Yes | No | App functionality |

Everything else (location, health, financial info, contacts, browsing,
search, usage data, diagnostics, sensitive info, photos, audio) → **Not collected**.

## Google Play — App content → Data safety

- **Does your app collect or share any of the required user data types?** Yes
- **Is all of the user data collected by your app encrypted in transit?** Yes
- **Do you provide a way for users to request that their data is deleted?** Yes —
  in the app (Settings → Delete account) and at
  https://udyamflow.com/legal/delete-account
- **Shared with third parties?** No. Payment processors, email/SMS providers
  and hosting act on our behalf ("service providers"), which Google does not
  count as sharing.

| Category → type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Personal info → Name | Yes | No | Required | App functionality, Account management |
| Personal info → Email address | Yes | No | Required | App functionality, Account management |
| Personal info → Phone number | Yes | No | Required for bookings | App functionality |
| Personal info → User IDs | Yes | No | Required | App functionality, Account management |
| Financial info → Purchase history | Yes | No | Required for paid bookings | App functionality |

Processed ephemerally: none. Collected data is not used for advertising,
marketing, analytics, personalisation or fraud prevention beyond the app's own
rate limiting.
