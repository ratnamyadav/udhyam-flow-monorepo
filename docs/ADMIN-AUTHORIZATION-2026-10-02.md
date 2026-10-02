# Admin authorization verification — 2 October 2026

## Enforced conditions and route inventory

Platform access requires an authenticated **server session** with the exact case-sensitive value `session.user.role === 'admin'`. BetterAuth declares this user field `input: false`, default `user`. A tenant membership role of owner/admin/member, active organization, role header or submitted form field does not grant platform access. Trusted fixture admins are intentionally allowed global platform reads; ordinary foreign-tenant users are denied. Regular tenant routes independently verify membership in the active organization.

- `apps/admin/lib/staff.ts`: `getStaff()` redirects missing sessions to `/sign-in`, returns `caller: null` for non-admins, and rebuilds authenticated context before creating a platform API caller for admins. That caller's procedures independently check the role again.
- `/dashboard` layout calls `getStaff()`. Overview, organizations and users pages each call `requireStaffCaller()` before requesting data.
- `/gst` calls `requireAdmin()` before database queries. Both exported public POST server actions (`setPlatformGstThreshold`, `setStoreGstThreshold`) call that guard themselves before any query/write. They do not rely on the page gate.
- Admin's only route-handler file is `/api/auth/[...all]`, delegated to BetterAuth. It does not grant a platform role. The shared web `/api/trpc/[trpc]` endpoint exposes the platform API through `fetchRequestHandler` and `createTRPCContext`.
- Every platform API procedure (`admin.overview`, `admin.listOrganizations`, `admin.listUsers`) uses `platformAdminProcedure`, which requires a session user and exact platform role before reading data. Missing session gives UNAUTHORIZED/HTTP401; other roles give FORBIDDEN/HTTP403. No new procedure or permission was added.

## Verified routing fix

Source commit `e8d31149fcc40283645f563f09f0ffe2eb53770e` changes only the denied `requireStaffCaller()` redirect from `/dashboard` to `/sign-in`. The dashboard page itself calls this guard, so the previous destination was a self-redirect. The tested denial now reaches a public sign-in route; the role condition and data-access checks are unchanged. This is a routing correction, not new staff access. It has not yet received a fresh Next production build because Mybooz owns the heavy slot. Admin typecheck and actual-function guard tests pass. Earlier admin compiled/form evidence remains at `85206ab`, before this one-line correction.

## Targeted test evidence

- 20 API tests pass: 7 new `admin-authorization.test.ts` cases plus 13 existing `authz.test.ts` cases. These use migrated in-memory PGlite, the real `createAppAuth` handler/BetterAuth cookie session, real `appRouter` middleware/procedures and the same tRPC fetch adapter as production.
- All three platform procedures deny anonymous and ordinary OTP callers before data access, even with forged headers. Signup input `role: admin` cannot promote the user; authenticated `/update-user` with that role returns400 and leaves role `user`.
- Owner/admin/member tenant membership does not satisfy platform role. An ordinary caller using a foreign active workspace remains denied by all three platform procedures and by the tenant location route.
- A trusted admin seeded only in this disposable database can read platform data across tenants. Demoting that fixture user to `user` denies the same existing cookie on its next session read.
- Faulting data adapters cause all three authorized procedures to reject with INTERNAL_SERVER_ERROR and HTTP500, without a `result` or default privileged statistics. A faulting authentication/context path also returns HTTP500 without results. Anonymous/ordinary HTTP responses are401/403 without results.
- 11 additional `admin-server-gates.spec.ts` tests execute the actual Next guard and GST action functions with mocked Next headers/redirect/cache and authentication/adapter boundaries. Missing sessions, `user`, owner/member, wrong-case roles, missing role and foreign/header claims are denied without API caller creation or GST select/insert. Auth/context errors propagate; authorized write/query errors do not report saved or revalidate. The exact permitted server role still admits the guarded path. The denied guard's new `/sign-in` destination is asserted.
- API and admin typechecks pass. Logs: `/tmp/udyamflow-admin-api-authorization-test.log`, `/tmp/udyamflow-admin-server-gates-test.log`, `/tmp/udyamflow-admin-authorization-types.log`, `/tmp/udyamflow-admin-gate-types.log`. This is 31 targeted tests, not a fresh rerun of the entire suite. Earlier full210-test verification remains historical evidence.

Reproduce from the pnpm checkout:

```sh
pnpm --filter @udyamflow/api test -- admin-authorization.test.ts authz.test.ts
pnpm --filter @udyamflow/api exec vitest run --config vitest.admin.config.ts
pnpm --filter @udyamflow/api check-types
pnpm --filter @udyamflow/admin check-types
```

## Boundary and remaining checks

PGlite verifies actual SQL/schema/auth/session/procedure behavior; it does **not** exercise production `drizzle-orm/neon-http` transport. The Next framework and auth/DB boundaries are mocked only for direct server-guard/action tests. No production user, role, key, database or configuration was accessed or changed. Fixture promotion/demotion exists only in disposable test data.

No usable disposable Neon HTTP runtime was identified; PostgreSQL executables are not on PATH, and a plain local Postgres server would not by itself implement the Neon HTTP transport. Actual deployed server/RSC/driver fault behavior and final protected-page navigation require configured authorized integration QA. The safe local tests establish fail-closed guard and procedure behavior, not production transport availability or a full deployed dashboard render.

A fresh admin production build after `e8d3114` is PENDING shared-slot availability. Web app/shared form/auth-handler source is unchanged; unsigned native artifacts remain verified at mobile source `0508783`. No heavy build, service provisioning, credentials retrieval, fees or production writes occurred in this follow-up.
