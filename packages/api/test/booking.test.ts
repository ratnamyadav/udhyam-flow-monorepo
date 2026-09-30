import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
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
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.CASHFREE_CLIENT_ID;
  delete process.env.CASHFREE_CLIENT_SECRET;
  db = await createTestDb();
});

const book = (
  f: Awaited<ReturnType<typeof seedOrg>>,
  start: Date,
  extra: Partial<{
    serviceId: string;
    resourceId: string;
    locationId: string;
    orgSlug: string;
  }> = {},
) =>
  publicCaller(db).booking.create({
    orgSlug: f.slug,
    resourceId: f.resourceId,
    locationId: f.locationId,
    customerName: 'Asha Rao',
    customerEmail: 'asha@example.com',
    slotStart: start.toISOString(),
    ...extra,
  });

describe('booking.listSlots', () => {
  it('uses the requested date’s weekday in a timezone behind UTC', async () => {
    const f = await seedOrg(db, { timezone: 'America/New_York' });
    // Open only on the weekday of the requested date.
    const { date } = slotOn(f, 3, '09:00');
    const { dayOfWeek } = await import('../src/lib/time');
    await db.delete(schema.resourceHours).where(eq(schema.resourceHours.resourceId, f.resourceId));
    await db.insert(schema.resourceHours).values({
      resourceId: f.resourceId,
      dayOfWeek: dayOfWeek(date),
      openMin: 9 * 60,
      closeMin: 10 * 60,
    });
    const res = await publicCaller(db).booking.listSlots({
      orgSlug: f.slug,
      locationId: f.locationId,
      resourceId: f.resourceId,
      date,
    });
    expect(res.timezone).toBe('America/New_York');
    expect(res.slots.map((s) => s.displayTime)).toEqual(['09:00', '09:30']);
  });

  it('returns nothing for another tenant’s resource or a date past the horizon', async () => {
    const a = await seedOrg(db);
    const b = await seedOrg(db);
    const foreign = await publicCaller(db).booking.listSlots({
      orgSlug: a.slug,
      locationId: a.locationId,
      resourceId: b.resourceId,
    });
    expect(foreign.slots).toEqual([]);
    const { date } = slotOn(a, 120, '09:00');
    const far = await publicCaller(db).booking.listSlots({
      orgSlug: a.slug,
      locationId: a.locationId,
      resourceId: a.resourceId,
      date,
    });
    expect(far.slots).toEqual([]);
  });
});

describe('booking.create', () => {
  it('confirms a free booking and snapshots price', async () => {
    const f = await seedOrg(db);
    const { start } = slotOn(f, 1, '10:00');
    const res = await book(f, start);
    expect(res).toMatchObject({ status: 'confirmed', requiresPayment: false, amountCents: 0 });
    const [row] = await db.select().from(schema.booking).where(eq(schema.booking.id, res.id));
    const { PROFESSIONS } = await import('@udyamflow/tokens');
    expect(row!.slotEnd.getTime() - row!.slotStart.getTime()).toBe(
      PROFESSIONS.doctor.slotDuration * 60_000,
    );
  });

  it('rejects ids from another tenant (cross-tenant booking)', async () => {
    const a = await seedOrg(db);
    const b = await seedOrg(db);
    const { start } = slotOn(a, 1, '10:00');
    await expect(book(a, start, { resourceId: b.resourceId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const bService = await addService(db, b.orgId);
    await expect(book(a, start, { serviceId: bService })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('requires a service when the resource offers one (no skipping a paid service)', async () => {
    const f = await seedOrg(db);
    await addService(db, f.orgId, { priceCents: 50_000 });
    const { start } = slotOn(f, 1, '10:00');
    await expect(book(f, start)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Please choose a service.',
    });
  });

  it('rejects a service the chosen resource does not offer', async () => {
    const f = await seedOrg(db);
    const other = uid('res');
    await db
      .insert(schema.resource)
      .values({ id: other, organizationId: f.orgId, locationId: f.locationId, name: 'Other' });
    const svc = await addService(db, f.orgId, { resourceIds: [other] });
    const { start } = slotOn(f, 1, '10:00');
    await expect(book(f, start, { serviceId: svc })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects past, off-grid and out-of-hours starts', async () => {
    const f = await seedOrg(db);
    const past = slotOn(f, -1, '10:00');
    const offGrid = slotOn(f, 1, '10:07');
    const closed = slotOn(f, 1, '20:00');
    for (const s of [past, offGrid, closed]) {
      await expect(book(f, s.start)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
  });

  it('blocks overlapping bookings, not just identical start times', async () => {
    const f = await seedOrg(db);
    const hour = await addService(db, f.orgId, { durationMin: 60 });
    const { start } = slotOn(f, 2, '10:00');
    await book(f, start, { serviceId: hour });
    // 10:30 falls inside the 10:00–11:00 booking.
    const half = await addService(db, f.orgId, { durationMin: 30 });
    const overlap = slotOn(f, 2, '10:30');
    await expect(book(f, overlap.start, { serviceId: half })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const slots = await publicCaller(db).booking.listSlots({
      orgSlug: f.slug,
      locationId: f.locationId,
      resourceId: f.resourceId,
      serviceId: half,
      date: overlap.date,
    });
    expect(slots.slots.map((s) => s.displayTime)).not.toContain('10:30');
    expect(slots.slots.map((s) => s.displayTime)).toContain('11:00');
  });

  it('the database itself rejects overlapping active bookings (race guard)', async () => {
    const f = await seedOrg(db);
    const base = {
      organizationId: f.orgId,
      locationId: f.locationId,
      resourceId: f.resourceId,
      customerName: 'X',
    };
    await db.insert(schema.booking).values({
      ...base,
      id: uid('bkg'),
      slotStart: new Date('2030-01-01T10:00:00Z'),
      slotEnd: new Date('2030-01-01T11:00:00Z'),
    });
    await expect(
      db.insert(schema.booking).values({
        ...base,
        id: uid('bkg'),
        slotStart: new Date('2030-01-01T10:30:00Z'),
        slotEnd: new Date('2030-01-01T11:30:00Z'),
      }),
    ).rejects.toThrow();
    // A cancelled booking doesn't block.
    await db.insert(schema.booking).values({
      ...base,
      id: uid('bkg'),
      status: 'cancelled',
      slotStart: new Date('2030-01-01T10:30:00Z'),
      slotEnd: new Date('2030-01-01T11:30:00Z'),
    });
  });

  it('does not let a public booking overwrite an existing customer record', async () => {
    const f = await seedOrg(db);
    const { start } = slotOn(f, 1, '11:00');
    await book(f, start);
    const [before] = await db
      .select()
      .from(schema.customer)
      .where(eq(schema.customer.organizationId, f.orgId));
    await db
      .update(schema.customer)
      .set({ name: 'Asha Rao (VIP)', phone: '+919876543210' })
      .where(eq(schema.customer.id, before!.id));

    const later = slotOn(f, 1, '12:00');
    await publicCaller(db).booking.create({
      orgSlug: f.slug,
      resourceId: f.resourceId,
      locationId: f.locationId,
      customerName: 'Attacker',
      customerEmail: 'ASHA@example.com',
      customerPhone: '+1 555 000 0000',
      slotStart: later.start.toISOString(),
    });
    const customers = await db
      .select()
      .from(schema.customer)
      .where(eq(schema.customer.organizationId, f.orgId));
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ name: 'Asha Rao (VIP)', phone: '+919876543210' });
  });
});

describe('booking status transitions', () => {
  it('only allows valid transitions and never double-cancels', async () => {
    const f = await seedOrg(db);
    const owner = userCaller(db, f.ownerId, f.orgId);
    const { start } = slotOn(f, 1, '13:00');
    const { id } = await book(f, start);

    await owner.booking.cancel({ id });
    await expect(owner.booking.cancel({ id })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await expect(owner.booking.markComplete({ id })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('listToday uses the location timezone and returns it', async () => {
    const f = await seedOrg(db, { timezone: 'Pacific/Auckland' });
    const owner = userCaller(db, f.ownerId, f.orgId);
    const res = await owner.booking.listToday();
    const { todayInTz } = await import('../src/lib/time');
    expect(res.timezone).toBe('Pacific/Auckland');
    expect(res.date).toBe(todayInTz('Pacific/Auckland'));
  });
});
