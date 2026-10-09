import { createHash, randomBytes } from 'node:crypto';
import { createMcpVerifier } from '@udyamflow/auth/mcp';
import { createAppAuth, MCP_RESOURCE } from '@udyamflow/auth/server';
import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ownerMcpHandler } from '../src/mcp';
import { appRouter } from '../src/router';
import type { Context } from '../src/trpc';
import { addMember, createTestDb, seedOrg, uid } from './helpers/harness';

// The whole "connect an assistant" flow through the real BetterAuth handler:
// dynamic client registration → email-code sign-in → authorize → consent →
// token → MCP call → disconnect. What Claude and ChatGPT do, minus the UI.

const ORIGIN = 'http://localhost:3000';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let auth: ReturnType<typeof createAppAuth>;
const mail = new Map<string, string>();

beforeAll(async () => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'local-mcp-oauth-test-secret-at-least-32-chars');
  vi.stubEnv('TRUSTED_IP_HEADER', 'x-test-ip');
  db = await createTestDb();
  auth = createAppAuth(db, async (email, code) => {
    mail.set(email, code);
  });
  // The resource server fetches the issuer's JWKS over HTTP; serve it from
  // the in-process handler.
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith(`${ORIGIN}/api/auth/`)
      ? auth.handler(new Request(input, init))
      : realFetch(input, init);
  });
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function authReq(
  path: string,
  opts: { body?: unknown; cookie?: string; form?: Record<string, string>; server?: boolean } = {},
) {
  // `server`: a call from the assistant's backend — no browser Origin.
  const headers: Record<string, string> = { 'x-test-ip': uid('ip') };
  if (!opts.server) headers.origin = ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: string | undefined;
  if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body,
      redirect: 'manual',
    }),
  );
}

async function signIn(email: string) {
  await authReq('/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } });
  const res = await authReq('/sign-in/email-otp', { body: { email, otp: mail.get(email) } });
  expect(res.status).toBe(200);
  const user = ((await res.json()) as { user: { id: string } }).user;
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return { userId: user.id, cookie };
}

async function connect(cookie: string, scope: string) {
  const reg = await authReq('/oauth2/register', {
    server: true,
    body: {
      client_name: 'Claude',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  });
  expect(reg.status).toBeLessThan(300);
  const { client_id } = (await reg.json()) as { client_id: string };

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorize = await authReq(
    `/oauth2/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id,
      redirect_uri: REDIRECT,
      scope,
      state: 'st',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: MCP_RESOURCE,
    })}`,
    { cookie },
  );
  const consentUrl = new URL(authorize.headers.get('location') ?? '', ORIGIN);
  expect(consentUrl.pathname).toBe('/oauth/consent');

  const consent = await authReq('/oauth2/consent', {
    cookie,
    body: { accept: true, oauth_query: consentUrl.search.slice(1) },
  });
  const { url } = (await consent.json()) as { url: string };
  const code = new URL(url).searchParams.get('code');
  expect(code).toBeTruthy();

  const token = await authReq('/oauth2/token', {
    server: true,
    form: {
      grant_type: 'authorization_code',
      code: code!,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id,
      resource: MCP_RESOURCE,
    },
  });
  expect(token.status).toBe(200);
  const tokens = (await token.json()) as { access_token: string; refresh_token?: string };
  return { client_id, ...tokens };
}

let rpcId = 0;
async function mcpCall(accessToken: string, name: string, args: Record<string, unknown> = {}) {
  const verify = createMcpVerifier(auth, db);
  const handler = ownerMcpHandler({ db, appUrl: ORIGIN });
  const req = new Request(MCP_RESOURCE, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const identity = await verify(req);
  if (identity instanceof Response) return { status: identity.status, identity: null, text: '' };
  const res = await handler.fetch(req, {
    authInfo: {
      token: '',
      clientId: identity.clientId,
      scopes: identity.scopes,
      extra: { identity },
    },
  });
  const raw = await res.text();
  const line = raw.split('\n').find((l) => l.startsWith('data: '));
  const msg = JSON.parse(line ? line.slice(6) : raw);
  return { status: res.status, identity, text: msg.result.content[0].text as string };
}

describe('connecting an AI assistant over OAuth', () => {
  it('issues a workspace-bound token the MCP endpoint accepts, until disconnected', async () => {
    const f = await seedOrg(db);
    const email = `${uid('owner')}@example.test`;
    const { userId, cookie } = await signIn(email);
    await addMember(db, f.orgId, userId, 'owner');
    // Joined after signing in, so pick the workspace (new sessions start in
    // the oldest one automatically). One workspace: no picker.
    await authReq('/organization/set-active', { cookie, body: { organizationId: f.orgId } });

    const tokens = await connect(cookie, 'offline_access workspace:read workspace:write');
    expect(tokens.refresh_token).toBeTruthy();

    const ok = await mcpCall(tokens.access_token, 'get_business_overview');
    expect(ok.identity).toMatchObject({ userId, organizationId: f.orgId });
    expect(JSON.parse(ok.text).canMakeChanges).toBe(true);

    expect((await mcpCall('not-a-token', 'get_business_overview')).status).toBe(401);

    // Disconnect from Settings → AI assistants.
    const caller = appRouter.createCaller({
      db,
      headers: new Headers(),
      session: {
        user: { id: userId, role: 'user' },
        session: { id: 's', userId, activeOrganizationId: f.orgId },
      },
    } as unknown as Context);
    const [connection] = await caller.assistants.list();
    expect(connection).toMatchObject({ name: 'Claude', canMakeChanges: true });
    await caller.assistants.disconnect({ id: connection!.id });
    expect((await mcpCall(tokens.access_token, 'get_business_overview')).status).toBe(401);
    const refreshRows = await db
      .select()
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.userId, userId));
    expect(refreshRows.length).toBeGreaterThan(0);
    expect(refreshRows.every((r) => r.revoked)).toBe(true);
    const refreshed = await authReq('/oauth2/token', {
      server: true,
      form: {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token!,
        client_id: tokens.client_id,
        resource: MCP_RESOURCE,
      },
    });
    expect(refreshed.status).toBeGreaterThanOrEqual(400);
  });

  it('sends people with several workspaces to the picker first', async () => {
    const a = await seedOrg(db);
    const b = await seedOrg(db);
    const email = `${uid('multi')}@example.test`;
    const { userId, cookie } = await signIn(email);
    await addMember(db, a.orgId, userId, 'owner');
    await addMember(db, b.orgId, userId, 'member');
    const reg = await authReq('/oauth2/register', {
      server: true,
      body: {
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
      },
    });
    const { client_id } = (await reg.json()) as { client_id: string };
    const res = await authReq(
      `/oauth2/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id,
        redirect_uri: REDIRECT,
        scope: 'workspace:read',
        code_challenge: 'x'.repeat(43),
        code_challenge_method: 'S256',
        resource: MCP_RESOURCE,
      })}`,
      { cookie },
    );
    expect(new URL(res.headers.get('location') ?? '', ORIGIN).pathname).toBe('/oauth/workspace');
  });
});
