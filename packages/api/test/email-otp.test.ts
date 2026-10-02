import { createAppAuth } from '@udyamflow/auth/server';
import { schema, takeAuthRateLimit } from '@udyamflow/db';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, seedOrg, uid } from './helpers/harness';

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
const mail = new Map<string, string[]>();
const deletionMail: string[] = [];
let auth: ReturnType<typeof createAppAuth>;
beforeAll(async () => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'local-otp-test-secret-at-least-thirty-two-characters');
  vi.stubEnv('TRUSTED_IP_HEADER', 'x-test-ip');
  db = await createTestDb();
  auth = createAppAuth(
    db,
    async (email, code) => {
      mail.set(email, [...(mail.get(email) ?? []), code]);
    },
    async ({ url }) => {
      deletionMail.push(url);
    },
  );
});
afterAll(() => vi.unstubAllEnvs());
const email = () => `${uid('otp')}@example.test`;
async function request(path: string, body?: unknown, cookie?: string, ip = uid('ip')) {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
        'x-test-ip': ip,
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function authResult(response: Response) {
  return (await response.json()) as {
    token: string;
    user: { id: string; name: string; email: string; emailVerified: boolean; role: string };
  };
}
const send = (address: string, ip?: string) =>
  request('/email-otp/send-verification-otp', { email: address, type: 'sign-in' }, undefined, ip);
const verify = (address: string, otp: string, extra: Record<string, unknown> = {}) =>
  request('/sign-in/email-otp', { email: address, otp, ...extra });
const code = (address: string) => mail.get(address)?.at(-1) ?? '';
async function resetRateLimits() {
  await db.delete(schema.verification).where(like(schema.verification.identifier, 'auth-limit-%'));
}

describe('passwordless email OTP through the real auth handler', () => {
  it('creates a verified ordinary user only after the code and persists its cookie session', async () => {
    const address = email();
    expect((await send(`  ${address.toUpperCase()}  `)).status).toBe(200);
    expect(
      await db.query.user.findFirst({ where: eq(schema.user.email, address) }),
    ).toBeUndefined();
    const stored = await db.query.verification.findFirst({
      where: eq(schema.verification.identifier, `sign-in-otp-${address}`),
    });
    expect(stored?.value).not.toContain(code(address));
    expect(code(address)).toMatch(/^\d{6}$/);
    const result = await verify(address, code(address), { name: 'New owner' });
    expect(result.status).toBe(200);
    const data = await authResult(result);
    expect(data.user).toMatchObject({
      email: address,
      emailVerified: true,
      role: 'user',
      name: 'New owner',
    });
    const cookie = result.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const session = await authResult(await request('/get-session', undefined, cookie));
    expect(session.user.id).toBe(data.user.id);
    expect((await verify(address, code(address))).status).not.toBe(200);
  });
  it('preserves a verified existing owner, its account and existing sessions/memberships', async () => {
    const fixture = await seedOrg(db);
    const owner = await db.query.user.findFirst({ where: eq(schema.user.id, fixture.ownerId) });
    if (!owner) throw new Error('Missing fixture user');
    await db
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, fixture.ownerId));
    await db.insert(schema.account).values({
      id: uid('account'),
      userId: fixture.ownerId,
      providerId: 'credential',
      accountId: fixture.ownerId,
      password: 'existing-hash-preserved',
    });
    await db.insert(schema.session).values({
      id: uid('session'),
      userId: fixture.ownerId,
      token: uid('token'),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await send(owner.email);
    const result = await verify(owner.email, code(owner.email), { name: 'Do not overwrite' });
    expect(result.status).toBe(200);
    const data = await authResult(result);
    expect(data.user.id).toBe(fixture.ownerId);
    expect(data.user.name).toBe(owner.name);
    expect(
      (await db.query.account.findFirst({ where: eq(schema.account.userId, fixture.ownerId) }))
        ?.password,
    ).toBe('existing-hash-preserved');
    expect(
      (await db.select().from(schema.session).where(eq(schema.session.userId, fixture.ownerId)))
        .length,
    ).toBe(2);
    const newSession = await db.query.session.findFirst({
      where: eq(schema.session.token, data.token),
    });
    expect(newSession?.activeOrganizationId).toBe(fixture.orgId);
  });
  it('rejects expired and reused codes and consumes concurrent verification only once', async () => {
    const expired = email();
    await send(expired);
    await db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.verification.identifier, `sign-in-otp-${expired}`));
    expect((await verify(expired, code(expired))).status).not.toBe(200);
    const address = email();
    await send(address);
    const results = await Promise.all([
      verify(address, code(address)),
      verify(address, code(address)),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect((await verify(address, code(address))).status).not.toBe(200);
    const user = await db.query.user.findFirst({ where: eq(schema.user.email, address) });
    expect(
      await db
        .select()
        .from(schema.session)
        .where(eq(schema.session.userId, user?.id ?? '')),
    ).toHaveLength(1);
  });
  it('locks a challenge after five wrong codes', async () => {
    const address = email();
    await send(address);
    const wrong = code(address) === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify(address, wrong)).status).not.toBe(200);
    expect((await verify(address, code(address))).status).not.toBe(200);
    expect(
      await db.query.user.findFirst({ where: eq(schema.user.email, address) }),
    ).toBeUndefined();
  });
  it('enforces persistent cooldown and invalidates every older challenge on resend', async () => {
    const address = email();
    await send(address);
    const old = code(address);
    expect((await send(address)).status).not.toBe(200);
    expect(mail.get(address)).toHaveLength(1);
    await resetRateLimits();
    expect((await send(address)).status).toBe(200);
    const next = code(address);
    const rows = await db
      .select()
      .from(schema.verification)
      .where(eq(schema.verification.identifier, `sign-in-otp-${address}`));
    expect(rows).toHaveLength(1);
    // Cryptographic generation can coincidentally repeat; storage still rotates.
    if (next !== old) expect((await verify(address, old)).status).not.toBe(200);
    expect((await verify(address, next)).status).toBe(200);
  });
  it('gives identical send responses for known and unknown accounts', async () => {
    await resetRateLimits();
    const known = email();
    const unknown = email();
    await db
      .insert(schema.user)
      .values({ id: uid('user'), email: known, name: 'Existing', emailVerified: true });
    const a = await send(known);
    const b = await send(unknown);
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
    expect(mail.has(known)).toBe(true);
    expect(mail.has(unknown)).toBe(true);
  });
  it('enforces a database-shared recipient budget across challenges and atomic competing reservations', async () => {
    const key = uid('limit');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => takeAuthRateLimit(db, key, 3, 900)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await takeAuthRateLimit(db, key, 3, 900)).toBe(false);
    const address = email();
    for (let i = 0; i < 3; i++) {
      // Expire only cooldown, preserving the 15-minute recipient budget.
      await db
        .update(schema.verification)
        .set({ expiresAt: new Date(0) })
        .where(
          eq(
            schema.verification.identifier,
            `auth-limit-${(await import('node:crypto')).createHash('sha256').update(`otp:cooldown:${address}`).digest('hex')}`,
          ),
        );
      expect((await send(address)).status).toBe(200);
    }
    expect((await send(address)).status).not.toBe(200);
  });
  it('enforces a persistent IP send budget across different recipient addresses', async () => {
    await resetRateLimits();
    const ip = uid('shared-ip');
    for (let i = 0; i < 20; i++) expect((await send(email(), ip)).status).toBe(200);
    const before = await db.select().from(schema.verification);
    expect((await send(email(), ip)).status).not.toBe(200);
    expect(await db.select().from(schema.verification)).toHaveLength(before.length);
  });
  it('revokes unproven credentials/sessions when an unverified mailbox is first proven', async () => {
    await resetRateLimits();
    const address = email();
    const id = uid('unverified');
    await db
      .insert(schema.user)
      .values({ id, email: address, name: 'Existing unverified', emailVerified: false });
    await db.insert(schema.account).values({
      id: uid('account'),
      userId: id,
      providerId: 'credential',
      accountId: id,
      password: 'unproven-password-hash',
    });
    await db.insert(schema.session).values({
      id: uid('session'),
      userId: id,
      token: uid('old-session'),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await send(address);
    const result = await verify(address, code(address));
    expect(result.status).toBe(200);
    expect((await authResult(result)).user).toMatchObject({ id, emailVerified: true });
    expect(
      await db.query.account.findFirst({ where: eq(schema.account.userId, id) }),
    ).toBeUndefined();
    expect(
      await db.select().from(schema.session).where(eq(schema.session.userId, id)),
    ).toHaveLength(1);
  });
  it('requires a separate deletion email proof even after successful login', async () => {
    await resetRateLimits();
    const address = email();
    await send(address);
    const login = await verify(address, code(address));
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const before = deletionMail.length;
    const deletion = await request('/delete-user', { callbackURL: '/account-deletion' }, cookie);
    expect(deletion.status).toBe(200);
    expect(deletionMail).toHaveLength(before + 1);
    expect(await db.query.user.findFirst({ where: eq(schema.user.email, address) })).toBeDefined();
    const arbitrary = await request('/delete-user', { token: code(address) }, cookie);
    expect(arbitrary.status).not.toBe(200);
    expect(await db.query.user.findFirst({ where: eq(schema.user.email, address) })).toBeDefined();
  });
  it('blocks password and alternate OTP oracles and client-supplied admin privileges', async () => {
    for (const path of [
      '/sign-in/email',
      '/sign-up/email',
      '/email-otp/check-verification-otp',
      '/email-otp/request-password-reset',
      '/email-otp/change-email',
    ]) {
      expect(
        (
          await request(path, {
            email: email(),
            password: 'old-password',
            type: 'sign-in',
            otp: '123456',
          })
        ).status,
      ).not.toBe(200);
    }
    const address = email();
    await send(address);
    const result = await verify(address, code(address), { role: 'admin', name: 'Attacker' });
    if (result.status === 200) expect((await authResult(result)).user.role).toBe('user');
    expect(
      (await db.query.user.findFirst({ where: eq(schema.user.email, address) }))?.role,
    ).not.toBe('admin');
  });
});
