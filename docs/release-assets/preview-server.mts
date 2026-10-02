import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(`${root}/packages/api/package.json`);
const { createHTTPHandler } = await import(require.resolve('@trpc/server/adapters/standalone'));
const { createTestDb, seedOrg, slotOn, uid } = await import(
  `${root}/packages/api/test/helpers/harness.ts`
);
const { appRouter } = await import(`${root}/packages/api/src/router/index.ts`);
const schema = await import(`${root}/packages/db/src/schema/index.ts`);
const { eq } = await import(require.resolve('drizzle-orm'));
const db = await createTestDb();
const fixture = await seedOrg(db);
await db
  .update(schema.organization)
  .set({ name: 'Gurugram Wellness Studio', slug: 'gurugram-wellness-demo' })
  .where(eq(schema.organization.id, fixture.orgId));
await db
  .update(schema.location)
  .set({ name: 'Sector 56 · Gurugram' })
  .where(eq(schema.location.id, fixture.locationId));
await db
  .update(schema.resource)
  .set({ name: 'Asha Mehra' })
  .where(eq(schema.resource.id, fixture.resourceId));
await db
  .update(schema.user)
  .set({ name: 'Asha Mehra', email: 'asha@example.test' })
  .where(eq(schema.user.id, fixture.ownerId));
for (const [name, hour, status] of [
  ['Riya Kapoor', '09:30', 'confirmed'],
  ['Arjun Sharma', '11:00', 'confirmed'],
  ['Neha Rao', '14:00', 'confirmed'],
  ['Karan Shah', '16:00', 'completed'],
]) {
  const start = slotOn(fixture, 0, hour).start;
  await db.insert(schema.booking).values({
    id: uid('bkg'),
    organizationId: fixture.orgId,
    locationId: fixture.locationId,
    resourceId: fixture.resourceId,
    customerName: name,
    customerEmail: 'demo@example.test',
    slotStart: start,
    slotEnd: new Date(start.getTime() + 30 * 60000),
    status,
    amountCents: 85000,
    currency: 'INR',
  });
}
const session = {
  user: {
    id: fixture.ownerId,
    name: 'Asha Mehra',
    email: 'asha@example.test',
    emailVerified: true,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: uid('session'),
    userId: fixture.ownerId,
    token: 'synthetic-preview-only',
    activeOrganizationId: fixture.orgId,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};
const handler = createHTTPHandler({
  router: appRouter,
  createContext: () => ({ db, session, headers: new Headers({ 'x-real-ip': '127.0.0.1' }) }),
});
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8091');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ?? 'content-type,trpc-accept,x-trpc-source',
  );
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    res.statusCode = 403;
    return res.end(JSON.stringify({ error: 'Read-only synthetic preview' }));
  }
  if (req.url?.startsWith('/api/auth/get-session')) return res.end(JSON.stringify(session));
  if (req.url?.startsWith('/api/auth/organization/list'))
    return res.end(
      JSON.stringify([
        {
          id: fixture.orgId,
          name: 'Gurugram Wellness Studio',
          slug: 'gurugram-wellness-demo',
          createdAt: new Date(),
        },
      ]),
    );
  if (req.url?.startsWith('/api/trpc/')) {
    const allowed = new Set([
      'auth.activeMembership',
      'auth.me',
      'booking.listToday',
      'booking.list',
      'booking.get',
      'location.list',
      'resource.list',
    ]);
    const procedures = req.url.split('?')[0].slice('/api/trpc/'.length).split(',');
    if (procedures.some((name) => !allowed.has(name))) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: 'Procedure unavailable in synthetic preview' }));
    }
    req.url = req.url.slice('/api/trpc'.length);
    return handler(req, res);
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Synthetic preview: endpoint unavailable' }));
}).listen(3191, '127.0.0.1', () =>
  console.log(
    'Synthetic in-memory UdyamFlow preview on 127.0.0.1:3191. No production database or provider calls.',
  ),
);
