import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
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
  db = await createTestDb();
});

describe('booking.createByStaff', () => {
  it('books off-grid and outside hours, then rejects an overlap', async () => {
    const f = await seedOrg(db);
    const { date } = slotOn(f, 2, '00:00');
    const staff = userCaller(db, f.ownerId, f.orgId);
    const res = await staff.booking.createByStaff({
      resourceId: f.resourceId,
      date,
      time: '18:10',
      durationMin: 45,
      customerName: 'Walk In',
      customerPhone: '+91 98765 43210',
    });
    expect(res.slotEnd.getTime() - res.slotStart.getTime()).toBe(45 * 60_000);
    const [row] = await db.select().from(schema.booking).where(eq(schema.booking.id, res.id));
    expect(row).toMatchObject({ status: 'confirmed', source: 'staff' });

    await expect(
      staff.booking.createByStaff({
        resourceId: f.resourceId,
        date,
        time: '18:30',
        customerName: 'Second Person',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it("refuses another tenant's resource and dates a year out", async () => {
    const a = await seedOrg(db);
    const b = await seedOrg(db);
    const { date } = slotOn(a, 1, '10:00');
    const staff = userCaller(db, a.ownerId, a.orgId);
    await expect(
      staff.booking.createByStaff({
        resourceId: b.resourceId,
        date,
        time: '10:00',
        customerName: 'Nope Nope',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      staff.booking.createByStaff({
        resourceId: a.resourceId,
        date: slotOn(a, 400, '10:00').date,
        time: '10:00',
        customerName: 'Too Far',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('timeOff', () => {
  it('hides public slots, blocks public booking and reports existing bookings', async () => {
    const f = await seedOrg(db);
    const { date, start } = slotOn(f, 3, '10:00');
    const staff = userCaller(db, f.ownerId, f.orgId);
    const existing = await staff.booking.createByStaff({
      resourceId: f.resourceId,
      date,
      time: '12:00',
      customerName: 'Already Booked',
      notifyCustomer: false,
    });

    // Single-location business: no location or resource needed.
    const off = await staff.timeOff.add({
      startDate: date,
      startTime: '10:00',
      endTime: '13:00',
      reason: 'Lunch & errands',
    });
    expect(off.conflicts.map((c) => c.id)).toEqual([existing.id]);

    const slots = await publicCaller(db).booking.listSlots({
      orgSlug: f.slug,
      locationId: f.locationId,
      resourceId: f.resourceId,
      date,
    });
    const times = slots.slots.map((s) => s.displayTime);
    expect(times).toContain('09:30');
    expect(times).not.toContain('10:00');
    expect(times).not.toContain('12:30');
    expect(times).toContain('13:00');

    await expect(
      publicCaller(db).booking.create({
        orgSlug: f.slug,
        resourceId: f.resourceId,
        locationId: f.locationId,
        customerName: 'Asha Rao',
        slotStart: start.toISOString(),
      }),
    ).rejects.toBeTruthy();

    const open = await staff.booking.openSlots({ date });
    expect(open.resources[0]!.slots.map((s) => s.displayTime)).not.toContain('11:00');

    expect((await staff.timeOff.list()).map((t) => t.id)).toContain(off.id);
    await staff.timeOff.remove({ id: off.id });
    const after = await publicCaller(db).booking.listSlots({
      orgSlug: f.slug,
      locationId: f.locationId,
      resourceId: f.resourceId,
      date,
    });
    expect(after.slots.map((s) => s.displayTime)).toContain('10:00');
  });

  it('whole days block every resource at the location; other tenants cannot remove it', async () => {
    const f = await seedOrg(db);
    const other = await seedOrg(db);
    const { date } = slotOn(f, 4, '09:00');
    const off = await userCaller(db, f.ownerId, f.orgId).timeOff.add({
      locationId: f.locationId,
      startDate: date,
    });
    const slots = await publicCaller(db).booking.listSlots({
      orgSlug: f.slug,
      locationId: f.locationId,
      resourceId: f.resourceId,
      date,
    });
    expect(slots.slots).toEqual([]);
    await expect(
      userCaller(db, other.ownerId, other.orgId).timeOff.remove({ id: off.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('booking.reschedule', () => {
  it('moves a booking keeping its length, resets reminders, and refuses overlaps', async () => {
    const f = await seedOrg(db);
    const memberId = uid('usr');
    await addMember(db, f.orgId, memberId, 'member');
    const staff = userCaller(db, memberId, f.orgId);
    const { date } = slotOn(f, 2, '00:00');
    const a = await staff.booking.createByStaff({
      resourceId: f.resourceId,
      date,
      time: '10:00',
      durationMin: 60,
      customerName: 'Moving Customer',
      notifyCustomer: false,
    });
    await staff.booking.createByStaff({
      resourceId: f.resourceId,
      date,
      time: '14:00',
      customerName: 'Fixed Customer',
      notifyCustomer: false,
    });
    await db
      .update(schema.booking)
      .set({ reminderSentAt: new Date() })
      .where(eq(schema.booking.id, a.id));

    // Overlapping its own old slot is fine.
    const moved = await staff.booking.reschedule({
      id: a.id,
      date,
      time: '10:30',
      notifyCustomer: false,
    });
    expect(moved.slotEnd.getTime() - moved.slotStart.getTime()).toBe(60 * 60_000);
    const [row] = await db.select().from(schema.booking).where(eq(schema.booking.id, a.id));
    expect(row!.reminderSentAt).toBeNull();

    await expect(
      staff.booking.reschedule({ id: a.id, date, time: '13:30', notifyCustomer: false }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const other = await seedOrg(db);
    await expect(
      userCaller(db, other.ownerId, other.orgId).booking.reschedule({
        id: a.id,
        date,
        time: '16:00',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
