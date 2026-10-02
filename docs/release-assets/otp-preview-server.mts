// Local-only auth/UI verification. Never deploy: fixture codes are readable
// for automation, but belong only to allowlisted synthetic in-memory users.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

for (const name of [
  'DATABASE_URL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'MSG91_AUTH_KEY',
  'STRIPE_SECRET_KEY',
  'CASHFREE_CLIENT_ID',
  'CASHFREE_CLIENT_SECRET',
])
  delete process.env[name];
process.env.NODE_ENV = 'test';
process.env.BETTER_AUTH_SECRET = 'isolated-preview-auth-secret-at-least-32-characters';
process.env.BETTER_AUTH_URL = 'http://localhost:3191';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:8091';
process.env.NEXT_PUBLIC_AUTH_URL = 'http://localhost:3191';
process.env.TRUSTED_ORIGINS = 'http://localhost:8091';
process.env.TRUSTED_IP_HEADER = 'x-fixture-ip';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(`${root}/packages/api/package.json`);
const { createHTTPHandler } = await import(require.resolve('@trpc/server/adapters/standalone'));
const { createTestDb } = await import(`${root}/packages/api/test/helpers/harness.ts`);
const { createAppAuth } = await import(`${root}/packages/auth/src/server.ts`);
const { appRouter } = await import(`${root}/packages/api/src/router/index.ts`);
const database = await createTestDb();
const fixtureEmails = new Set([
  'asha@example.test',
  'new-owner@example.test',
  'resend@example.test',
]);
const codes = new Map<string, string>();
const auth = createAppAuth(
  database,
  async (email, code) => {
    if (!fixtureEmails.has(email)) throw new Error('Synthetic recipient required');
    codes.set(email, code);
  },
  async () => {
    throw new Error('Deletion is unavailable in this fixture');
  },
);
const allowedAuth = new Set([
  '/get-session',
  '/sign-in/email-otp',
  '/email-otp/send-verification-otp',
  '/organization/list',
  '/sign-out',
]);
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8091');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,trpc-accept,x-trpc-source');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost:3191');
  if (req.method === 'GET' && url.pathname === '/fixture/otp') {
    const email = url.searchParams.get('email') ?? '';
    if (!fixtureEmails.has(email)) {
      res.statusCode = 403;
      res.end('{}');
      return;
    }
    res.end(JSON.stringify({ code: codes.get(email) ?? null }));
    return;
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers))
    if (typeof value === 'string') headers.set(name, value);
  headers.set('x-fixture-ip', 'isolated-browser-fixture');
  if (url.pathname.startsWith('/api/trpc/') && req.method === 'GET') {
    const procedures = url.pathname.slice('/api/trpc/'.length).split(',');
    if (
      procedures.some(
        (name) => !['auth.listOrganizations', 'auth.activeMembership', 'auth.me'].includes(name),
      )
    ) {
      res.statusCode = 403;
      res.end('{}');
      return;
    }
    const session = await auth.api.getSession({ headers });
    const handler = createHTTPHandler({
      router: appRouter,
      createContext: () => ({ db: database, session, headers }),
    });
    req.url = req.url?.slice('/api/trpc'.length);
    handler(req, res);
    return;
  }
  if (
    !url.pathname.startsWith('/api/auth/') ||
    !allowedAuth.has(url.pathname.slice('/api/auth'.length))
  ) {
    res.statusCode = 403;
    res.end('{}');
    return;
  }
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 4096) {
        res.statusCode = 413;
        res.end('{}');
        return;
      }
    }
    if (body) {
      const input = JSON.parse(body);
      if (input.email && !fixtureEmails.has(String(input.email).trim().toLowerCase())) {
        res.statusCode = 403;
        res.end('{}');
        return;
      }
    }
    const response = await auth.handler(
      new Request(url, { method: req.method, headers, ...(body ? { body } : {}) }),
    );
    res.statusCode = response.status;
    for (const [name, value] of response.headers)
      if (name.toLowerCase() !== 'set-cookie') res.setHeader(name, value);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader('set-cookie', cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Synthetic fixture request failed' }));
  }
}).listen(3191, '127.0.0.1', () =>
  console.log(
    'Local in-memory OTP fixture; synthetic recipients only; no external mail, payments or production database.',
  ),
);
