import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { type Db, schema } from '@udyamflow/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { addDaysToDate, todayInTz, wallTimeToUtc } from '../../src/lib/time';
import { appRouter } from '../../src/router';
import type { Context } from '../../src/trpc';

// Real Postgres (PGlite, in-process) with the production migrations applied
// — including the btree_gist exclusion constraint — so tests exercise the
// same constraints the app relies on.
export async function createTestDb(): Promise<Db> {
  const client = new PGlite({ extensions: { btree_gist } });
  const db = drizzle({ client, schema, casing: 'snake_case' });
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, '../../../db/migrations'),
  });
  // PGlite's drizzle instance is a PgDatabase like neon-http's; the only
  // API difference (no `batch`) is handled by `atomic()`.
  return db as unknown as Db;
}

let seq = 0;
export const uid = (prefix: string) =>
  `${prefix}_${++seq}_${Math.random().toString(36).slice(2, 8)}`;

export type Fixture = {
  orgId: string;
  slug: string;
  locationId: string;
  resourceId: string;
  ownerId: string;
  timezone: string;
};

// An org with one location, one resource open every day 09:00–17:00, and an
// owner. Returns ids for the tests to use.
export async function seedOrg(
  db: Db,
  opts: { timezone?: string; currency?: 'USD' | 'INR' } = {},
): Promise<Fixture> {
  const orgId = uid('org');
  const slug = uid('slug').replace(/_/g, '-');
  const locationId = uid('loc');
  const resourceId = uid('res');
  const ownerId = uid('usr');
  const timezone = opts.timezone ?? 'Asia/Kolkata';
  await db.insert(schema.organization).values({ id: orgId, name: 'Test Clinic', slug });
  await db.insert(schema.tenantSettings).values({ organizationId: orgId, profession: 'doctor' });
  await db.insert(schema.location).values({
    id: locationId,
    organizationId: orgId,
    name: 'Main',
    timezone,
    currency: opts.currency ?? 'INR',
  });
  await db
    .insert(schema.resource)
    .values({ id: resourceId, organizationId: orgId, locationId, name: 'Dr. Test' });
  await db.insert(schema.resourceHours).values(
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      resourceId,
      dayOfWeek: d,
      openMin: 9 * 60,
      closeMin: 17 * 60,
    })),
  );
  await addMember(db, orgId, ownerId, 'owner');
  return { orgId, slug, locationId, resourceId, ownerId, timezone };
}

export async function addMember(
  db: Db,
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
) {
  await db
    .insert(schema.user)
    .values({ id: userId, name: `User ${userId}`, email: `${userId}@example.com` })
    .onConflictDoNothing();
  await db.insert(schema.member).values({ id: uid('mem'), userId, organizationId, role });
}

export async function addService(
  db: Db,
  orgId: string,
  opts: {
    priceCents?: number;
    currency?: 'USD' | 'INR';
    durationMin?: number;
    resourceIds?: string[];
  } = {},
) {
  const id = uid('svc');
  await db.insert(schema.service).values({
    id,
    organizationId: orgId,
    name: 'Consult',
    durationMin: opts.durationMin ?? 30,
    priceCents: opts.priceCents ?? 0,
    currency: opts.currency ?? 'INR',
  });
  if (opts.resourceIds?.length) {
    await db
      .insert(schema.serviceResource)
      .values(opts.resourceIds.map((resourceId) => ({ serviceId: id, resourceId })));
  }
  return id;
}

let ipSeq = 0;
// Anonymous caller (public booking page). Each gets its own IP so the rate
// limiter doesn't interfere across tests.
export function publicCaller(db: Db) {
  const headers = new Headers({ 'x-real-ip': `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}` });
  return appRouter.createCaller({ db, session: null, headers } as Context);
}

export function userCaller(
  db: Db,
  userId: string,
  activeOrganizationId: string | null,
  opts: { sessionId?: string; role?: string } = {},
) {
  const session = {
    user: { id: userId, name: 'U', email: `${userId}@example.com`, role: opts.role ?? 'user' },
    session: { id: opts.sessionId ?? uid('ses'), userId, activeOrganizationId },
  };
  return appRouter.createCaller({
    db,
    session: session as unknown as Context['session'],
    headers: new Headers({ 'x-real-ip': `10.9.9.${++ipSeq % 250}` }),
  } as Context);
}

// A slot start `daysAhead` days from today at HH:mm in the fixture's tz.
export function slotOn(f: Fixture, daysAhead: number, hhmm: string) {
  const date = addDaysToDate(todayInTz(f.timezone), daysAhead);
  const [h, m] = hhmm.split(':').map(Number);
  return { date, start: wallTimeToUtc(date, h! * 60 + m!, f.timezone) };
}
