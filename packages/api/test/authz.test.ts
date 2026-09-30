import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  addService,
  createTestDb,
  publicCaller,
  seedOrg,
  slotOn,
  uid,
  userCaller,
} from './helpers/harness';

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

describe('tenant membership', () => {
  it('rejects an active org the user is not a member of', async () => {
    const a = await seedOrg(db);
    const b = await seedOrg(db);
    await expect(userCaller(db, a.ownerId, b.orgId).location.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('falls back to the first membership when no org is active', async () => {
    const a = await seedOrg(db);
    const res = await userCaller(db, a.ownerId, null).auth.activeMembership();
    expect(res).toEqual({ organizationId: a.orgId, role: 'owner' });
  });

  it('requires onboarding when the user has no membership at all', async () => {
    await expect(userCaller(db, uid('usr'), null).location.list()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});

describe('roles', () => {
  it('members can read and run the day, but not change settings, catalog or payments', async () => {
    const f = await seedOrg(db);
    const memberId = uid('usr');
    await addMember(db, f.orgId, memberId, 'member');
    const member = userCaller(db, memberId, f.orgId);

    await expect(member.location.list()).resolves.toHaveLength(1);
    await expect(member.tenant.updateSettings({ accent: '#112233' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      member.location.create({ name: 'Annex', timezone: 'Asia/Kolkata', currency: 'INR' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(member.service.create({ name: 'Free', durationMin: 30 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(member.payment.connectStripe()).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const { start } = slotOn(f, 1, '10:00');
    const b = await publicCaller(db).booking.create({
      orgSlug: f.slug,
      resourceId: f.resourceId,
      locationId: f.locationId,
      customerName: 'Walk In',
      slotStart: start.toISOString(),
    });
    await expect(member.booking.markComplete({ id: b.id })).resolves.toMatchObject({ ok: true });
  });
});

describe('input hardening', () => {
  it('stripeAccountId cannot be set from the client; colors must be hex', async () => {
    const f = await seedOrg(db);
    const owner = userCaller(db, f.ownerId, f.orgId);
    await owner.tenant.updateSettings({
      accent: '#0f766e',
      // @ts-expect-error — no longer part of the input
      stripeAccountId: 'acct_someone_else',
    });
    const [s] = await db
      .select()
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, f.orgId));
    expect(s!.stripeAccountId).toBeNull();
    await expect(
      owner.tenant.updateSettings({ accent: 'red;}</style><script>' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('only accepts logo URLs from this org’s storage prefix', async () => {
    Object.assign(process.env, {
      STORAGE_BUCKET: 'logos',
      STORAGE_ACCESS_KEY_ID: 'k',
      STORAGE_SECRET_ACCESS_KEY: 's',
      STORAGE_PUBLIC_URL: 'https://cdn.example.com',
    });
    const { resetStorageForTests } = await import('@udyamflow/storage');
    resetStorageForTests();
    const f = await seedOrg(db);
    const owner = userCaller(db, f.ownerId, f.orgId);
    for (const logoUrl of [
      'https://tracker.example.com/pixel.png',
      'https://cdn.example.com/tenant-logos/org_someone_else/a.png',
    ]) {
      await expect(owner.tenant.updateSettings({ logoUrl })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    }
    await expect(
      owner.tenant.updateSettings({
        logoUrl: `https://cdn.example.com/tenant-logos/${f.orgId}/a.png`,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(owner.tenant.updateSettings({ logoUrl: null })).resolves.toEqual({ ok: true });
  });

  it('refuses to link or move onto another tenant’s records', async () => {
    const a = await seedOrg(db);
    const b = await seedOrg(db);
    const owner = userCaller(db, a.ownerId, a.orgId);
    await expect(
      owner.resource.update({ id: a.resourceId, locationId: b.locationId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      owner.service.create({ name: 'Mixed', durationMin: 30, resourceIds: [b.resourceId] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(owner.resource.listHours({ resourceId: b.resourceId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const svc = await addService(db, a.orgId);
    await expect(
      owner.service.setResources({ serviceId: svc, resourceIds: [b.resourceId] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('validates working hours', async () => {
    const f = await seedOrg(db);
    const owner = userCaller(db, f.ownerId, f.orgId);
    await expect(
      owner.resource.setHours({
        resourceId: f.resourceId,
        hours: [{ dayOfWeek: 1, openMin: 600, closeMin: 540 }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      owner.resource.setHours({
        resourceId: f.resourceId,
        hours: [
          { dayOfWeek: 1, openMin: 540, closeMin: 600 },
          { dayOfWeek: 1, openMin: 700, closeMin: 800 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('soft delete keeps history', () => {
  it('archiving a resource keeps its past bookings', async () => {
    const f = await seedOrg(db);
    const owner = userCaller(db, f.ownerId, f.orgId);
    const bookingId = uid('bkg');
    await db.insert(schema.booking).values({
      id: bookingId,
      organizationId: f.orgId,
      locationId: f.locationId,
      resourceId: f.resourceId,
      customerName: 'Past',
      status: 'completed',
      slotStart: new Date('2020-01-01T10:00:00Z'),
      slotEnd: new Date('2020-01-01T10:30:00Z'),
    });
    await owner.resource.remove({ id: f.resourceId });
    expect(await owner.resource.list()).toHaveLength(0);
    const rows = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
    expect(rows).toHaveLength(1);
  });

  it('won’t remove the only location', async () => {
    const f = await seedOrg(db);
    await expect(
      userCaller(db, f.ownerId, f.orgId).location.remove({ id: f.locationId }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('platform admin router', () => {
  it('is staff-only', async () => {
    const f = await seedOrg(db);
    await expect(userCaller(db, f.ownerId, f.orgId).admin.overview()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const stats = await userCaller(db, f.ownerId, f.orgId, { role: 'admin' }).admin.overview();
    expect(stats.organizations).toBeGreaterThan(0);
    const orgs = await userCaller(db, f.ownerId, null, { role: 'admin' }).admin.listOrganizations({
      query: f.slug,
    });
    expect(orgs[0]).toMatchObject({ id: f.orgId, memberCount: 1, locationCount: 1 });
  });
});

describe('onboarding.createOrganization', () => {
  it('creates the whole workspace and activates it on the session', async () => {
    const userId = uid('usr');
    const sessionId = uid('ses');
    await db.insert(schema.user).values({ id: userId, name: 'New', email: `${userId}@x.com` });
    await db.insert(schema.session).values({
      id: sessionId,
      userId,
      token: uid('tok'),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const caller = userCaller(db, userId, null, { sessionId });
    const slug = uid('new').replace(/_/g, '-');
    const res = await caller.onboarding.createOrganization({
      name: 'Fresh Studio',
      slug,
      templateId: 'salon',
      brand: { accent: '#7c3aed', logoText: 'fs' },
      locations: [{ name: 'Downtown', timezone: 'America/New_York', currency: 'USD' }],
    });
    const [session] = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.id, sessionId));
    expect(session!.activeOrganizationId).toBe(res.organizationId);
    const [settings] = await db
      .select()
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, res.organizationId));
    expect(settings).toMatchObject({ accent: '#7c3aed', logoText: 'FS', currency: 'USD' });
    const locations = await db
      .select()
      .from(schema.location)
      .where(eq(schema.location.organizationId, res.organizationId));
    expect(locations).toMatchObject([{ name: 'Downtown', timezone: 'America/New_York' }]);

    await expect(
      caller.onboarding.createOrganization({ name: 'Copycat', slug, templateId: 'salon' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects an unknown timezone', async () => {
    const f = await seedOrg(db);
    await expect(
      userCaller(db, f.ownerId, null).onboarding.createOrganization({
        name: 'Bad TZ',
        slug: uid('tz').replace(/_/g, '-'),
        templateId: 'doctor',
        locations: [{ name: 'Moon', timezone: 'Moon/Base', currency: 'USD' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
