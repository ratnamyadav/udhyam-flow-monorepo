import { type Db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { beforeAll, expect, it } from 'vitest';
import {
  addMember,
  createTestDb,
  publicCaller,
  seedOrg,
  slotOn,
  userCaller,
} from './helpers/harness';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

const userExists = async (id: string) =>
  (await db.select().from(schema.user).where(eq(schema.user.id, id))).length > 0;

it('requires typing DELETE to confirm', async () => {
  const f = await seedOrg(db);
  await expect(
    userCaller(db, f.ownerId, f.orgId).auth.deleteAccount({ confirm: 'yes' as 'DELETE' }),
  ).rejects.toThrow();
  expect(await userExists(f.ownerId)).toBe(true);
});

it('closes a workspace its sole owner deletes, keeping its records', async () => {
  const f = await seedOrg(db);
  const result = await userCaller(db, f.ownerId, f.orgId).auth.deleteAccount({ confirm: 'DELETE' });
  expect(result.closed).toEqual(['Test Clinic']);
  expect(await userExists(f.ownerId)).toBe(false);
  const [loc] = await db.select().from(schema.location).where(eq(schema.location.id, f.locationId));
  expect(loc!.archivedAt).not.toBeNull();
  // The organization (and its booking history) stays.
  expect(
    (await db.select().from(schema.organization).where(eq(schema.organization.id, f.orgId))).length,
  ).toBe(1);
});

it('refuses to strand a team without an owner', async () => {
  const f = await seedOrg(db);
  await addMember(db, f.orgId, `${f.ownerId}_staff`, 'member');
  await expect(
    userCaller(db, f.ownerId, f.orgId).auth.deleteAccount({ confirm: 'DELETE' }),
  ).rejects.toThrow(/someone else an owner/);
  expect(await userExists(f.ownerId)).toBe(true);
});

it('refuses while the closing workspace has upcoming bookings', async () => {
  const f = await seedOrg(db);
  await publicCaller(db).booking.create({
    orgSlug: f.slug,
    locationId: f.locationId,
    resourceId: f.resourceId,
    customerName: 'Upcoming Customer',
    slotStart: slotOn(f, 2, '10:00').start.toISOString(),
  });
  await expect(
    userCaller(db, f.ownerId, f.orgId).auth.deleteAccount({ confirm: 'DELETE' }),
  ).rejects.toThrow(/upcoming bookings/);
});

it('leaves a shared workspace running when a co-owner deletes their account', async () => {
  const f = await seedOrg(db);
  const coOwner = `${f.ownerId}_co`;
  await addMember(db, f.orgId, coOwner, 'owner');
  const result = await userCaller(db, coOwner, f.orgId).auth.deleteAccount({ confirm: 'DELETE' });
  expect(result.closed).toEqual([]);
  const [loc] = await db.select().from(schema.location).where(eq(schema.location.id, f.locationId));
  expect(loc!.archivedAt).toBeNull();
  const members = await db
    .select()
    .from(schema.member)
    .where(eq(schema.member.organizationId, f.orgId));
  expect(members.map((m) => m.userId)).toEqual([f.ownerId]);
});
