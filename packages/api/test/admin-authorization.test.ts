import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createAppAuth } from '@udyamflow/auth/server';
import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/router';
import type { Context } from '../src/trpc';
import { addMember, createTestDb, seedOrg } from './helpers/harness';

let db: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAppAuth>;
let cookie: string, userId: string, code: string;
const address = 'ordinary-otp-admin-qa@example.test';
beforeAll(async () => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'isolated-admin-authorization-secret-at-least-32-characters');
  db = await createTestDb();
  auth = createAppAuth(
    db,
    async (_email, otp) => {
      code = otp;
    },
    async () => {},
  );
  const request = (path: string, body: unknown) =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  expect(
    (await request('/email-otp/send-verification-otp', { email: address, type: 'sign-in' })).status,
  ).toBe(200);
  const verified = await request('/sign-in/email-otp', {
    email: address,
    otp: code,
    name: 'Synthetic Owner',
    role: 'admin',
  });
  expect(verified.status).toBe(200);
  cookie = verified.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ');
  const data = (await verified.json()) as { user: { id: string; role: string } };
  userId = data.user.id;
  expect(data.user.role).toBe('user');
});
afterAll(() => vi.unstubAllEnvs());
async function context(database = db): Promise<Context> {
  const headers = new Headers({ cookie, 'x-role': 'admin', 'x-organization-id': 'foreign' });
  return { db: database, headers, session: await auth.api.getSession({ headers }) };
}
const calls = (caller: ReturnType<typeof appRouter.createCaller>) => [
  () => caller.admin.overview(),
  () => caller.admin.listUsers({ limit: 1, offset: 0 }),
  () => caller.admin.listOrganizations({ limit: 1, offset: 0 }),
];
async function deny(ctx: Context, code: 'UNAUTHORIZED' | 'FORBIDDEN') {
  for (const call of calls(appRouter.createCaller(ctx)))
    await expect(call()).rejects.toMatchObject({ code });
}
function faultDb() {
  const select = vi.fn(() => {
    throw new Error('fixture data database unavailable');
  });
  return { database: { select } as unknown as typeof db, select };
}
describe('real platform admin procedures with migrated SQL and real OTP cookie sessions', () => {
  it('rejects all three unauthenticated procedures before any DB access', async () => {
    const f = faultDb();
    await deny(
      { db: f.database, session: null, headers: new Headers({ 'x-role': 'admin' }) },
      'UNAUTHORIZED',
    );
    expect(f.select).not.toHaveBeenCalled();
  });
  it('rejects ordinary verified OTP user and role/header tampering before DB access', async () => {
    const f = faultDb();
    await deny(await context(f.database), 'FORBIDDEN');
    expect(f.select).not.toHaveBeenCalled();
  });
  it('rejects profile-update role escalation through the actual auth endpoint', async () => {
    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/update-user', {
        method: 'POST',
        headers: { cookie, origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ordinary Owner', role: 'admin' }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await context()).session?.user.role).toBe('user');
    await deny(await context(), 'FORBIDDEN');
  });
  it('returns denied/error HTTP responses without privileged results on the production tRPC adapter', async () => {
    for (const name of ['overview', 'listUsers', 'listOrganizations']) {
      for (const authenticated of [false, true]) {
        const headers = new Headers(authenticated ? { cookie } : {});
        const response = await fetchRequestHandler({
          endpoint: '/api/trpc',
          req: new Request(`http://localhost:3000/api/trpc/admin.${name}`, { headers }),
          router: appRouter,
          createContext: async () => ({
            db,
            headers,
            session: authenticated ? await auth.api.getSession({ headers }) : null,
          }),
        });
        expect(response.status).toBe(authenticated ? 403 : 401);
        expect(await response.json()).not.toHaveProperty('result');
      }
    }
    const unavailable = await fetchRequestHandler({
      endpoint: '/api/trpc',
      req: new Request('http://localhost:3000/api/trpc/admin.overview'),
      router: appRouter,
      createContext: async () => {
        throw new Error('fixture authentication database unavailable');
      },
    });
    expect(unavailable.status).toBe(500);
    expect(await unavailable.json()).not.toHaveProperty('result');
  });
  it('does not promote tenant owner/admin/member or a foreign active workspace to platform admin', async () => {
    const a = await seedOrg(db),
      b = await seedOrg(db);
    await addMember(db, a.orgId, userId, 'owner');
    for (const role of ['owner', 'admin', 'member'] as const) {
      await db.update(schema.member).set({ role }).where(eq(schema.member.userId, userId));
      await deny(await context(), 'FORBIDDEN');
    }
    await db
      .update(schema.session)
      .set({ activeOrganizationId: b.orgId })
      .where(eq(schema.session.userId, userId));
    const ctx = await context();
    expect(ctx.session?.user.role).toBe('user');
    await deny(ctx, 'FORBIDDEN');
    await expect(appRouter.createCaller(ctx).location.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('admits trusted seeded platform admin, intentionally across tenants, then honors demotion on the same cookie', async () => {
    await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, userId));
    const ctx = await context();
    expect(ctx.session?.user.role).toBe('admin');
    const caller = appRouter.createCaller(ctx);
    expect((await caller.admin.overview()).organizations).toBeGreaterThanOrEqual(2);
    expect(await caller.admin.listUsers({ limit: 1, offset: 0 })).toHaveLength(1);
    expect(await caller.admin.listOrganizations({ limit: 1, offset: 0 })).toHaveLength(1);
    await db.update(schema.user).set({ role: 'user' }).where(eq(schema.user.id, userId));
    await deny(await context(), 'FORBIDDEN');
  });
  it('propagates every authorized data-query failure without returning privileged data/default stats', async () => {
    await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, userId));
    const f = faultDb();
    for (const call of calls(appRouter.createCaller(await context(f.database))))
      await expect(call()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    for (const name of ['overview', 'listUsers', 'listOrganizations']) {
      const response = await fetchRequestHandler({
        endpoint: '/api/trpc',
        req: new Request(`http://localhost:3000/api/trpc/admin.${name}`, { headers: { cookie } }),
        router: appRouter,
        createContext: () => context(f.database),
      });
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty('result');
    }
    expect(f.select).toHaveBeenCalledTimes(6);
    await db.update(schema.user).set({ role: 'user' }).where(eq(schema.user.id, userId));
  });
});
