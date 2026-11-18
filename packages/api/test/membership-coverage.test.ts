import { type Db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { contactMatchesMember, insertCoveredBooking } from '../src/memberships/credits';
import { REMINDER_PAY_TEMPLATE, REMINDER_TEMPLATE } from '../src/whatsapp/reminders';
import { runReminders } from '../src/whatsapp/run-reminders';
import {
  addService,
  createTestDb,
  type Fixture,
  publicCaller,
  seedOrg,
  slotOn,
  uid,
  userCaller,
} from './helpers/harness';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const DAY = 24 * 60 * 60 * 1000;
const MEMBER = { name: 'Meera Member', email: 'meera@example.com', phone: '9876543210' };

type Setup = {
  f: Fixture;
  covered: string;
  uncovered: string;
  planId: string;
  subId: string;
  cycleId: string;
};

async function setup(sessionLimit: number | null = 3): Promise<Setup> {
  const f = await seedOrg(db);
  const covered = await addService(db, f.orgId, { priceCents: 50_000 });
  const uncovered = await addService(db, f.orgId, { priceCents: 30_000 });
  const admin = userCaller(db, f.ownerId, f.orgId);
  const { id: planId } = await admin.membership.createPlan({
    name: 'Yoga Monthly',
    amountCents: 200_000,
    interval: 'month',
    intervalCount: 1,
    sessionsPerCycle: sessionLimit,
    serviceIds: [covered],
  });
  const customerId = uid('cus');
  await db.insert(schema.customer).values({ id: customerId, organizationId: f.orgId, ...MEMBER });
  const subId = uid('msub');
  await db.insert(schema.membershipSubscription).values({
    id: subId,
    organizationId: f.orgId,
    planId,
    customerId,
    cashfreeSubscriptionId: subId,
    status: 'active',
  });
  const paymentId = uid('mpay');
  const now = Date.now();
  await db.insert(schema.membershipPayment).values({
    id: paymentId,
    organizationId: f.orgId,
    subscriptionId: subId,
    cashfreePaymentId: paymentId,
    amountCents: 200_000,
    status: 'paid',
    paidAt: new Date(now - DAY),
  });
  const cycleId = uid('cycle');
  await db.insert(schema.membershipCycle).values({
    id: cycleId,
    subscriptionId: subId,
    paymentId,
    startsAt: new Date(now - DAY),
    endsAt: new Date(now + 30 * DAY),
    sessionLimit,
  });
  return { f, covered, uncovered, planId, subId, cycleId };
}

function book(
  s: Setup,
  serviceId: string,
  contact: { customerEmail?: string; customerPhone?: string },
  hhmm = '10:00',
) {
  return publicCaller(db).booking.create({
    orgSlug: s.f.slug,
    locationId: s.f.locationId,
    resourceId: s.f.resourceId,
    serviceId,
    membershipId: s.subId,
    customerName: 'Someone',
    slotStart: slotOn(s.f, 2, hhmm).start.toISOString(),
    ...contact,
  });
}

async function sessionsUsed(cycleId: string) {
  const [c] = await db
    .select({ used: schema.membershipCycle.sessionsUsed })
    .from(schema.membershipCycle)
    .where(eq(schema.membershipCycle.id, cycleId));
  return c!.used;
}

describe('plan services', () => {
  it('requires at least one active service from the same org', async () => {
    const f = await seedOrg(db);
    const other = await seedOrg(db);
    const own = await addService(db, f.orgId);
    const foreign = await addService(db, other.orgId);
    const archived = await addService(db, f.orgId);
    await db
      .update(schema.service)
      .set({ archivedAt: new Date() })
      .where(eq(schema.service.id, archived));
    const admin = userCaller(db, f.ownerId, f.orgId);
    const base = { name: 'Plan', amountCents: 10_000, interval: 'month' as const };
    await expect(admin.membership.createPlan({ ...base, serviceIds: [] })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(
      admin.membership.createPlan({ ...base, serviceIds: [own, foreign] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      admin.membership.createPlan({ ...base, serviceIds: [archived] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const { id } = await admin.membership.createPlan({ ...base, serviceIds: [own, own] });
    const [plan] = (await admin.membership.listPlans()).filter((p) => p.id === id);
    expect(plan!.services.map((s) => s.id)).toEqual([own]);
  });

  it('lets the tenant change covered services on update', async () => {
    const s = await setup();
    const admin = userCaller(db, s.f.ownerId, s.f.orgId);
    await expect(
      admin.membership.updatePlan({ id: s.planId, serviceIds: [] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await admin.membership.updatePlan({ id: s.planId, serviceIds: [s.uncovered] });
    const [plan] = (await admin.membership.listPlans()).filter((p) => p.id === s.planId);
    expect(plan!.services.map((x) => x.id)).toEqual([s.uncovered]);
    const res = await book(s, s.uncovered, { customerEmail: MEMBER.email });
    expect(res.amountCents).toBe(0);
    await expect(book(s, s.covered, { customerEmail: MEMBER.email }, '11:00')).rejects.toThrow(
      /doesn't include/,
    );
  });
});

describe('membership booking', () => {
  it('rejects a service not in the plan instead of charging or spending a credit', async () => {
    const s = await setup();
    await expect(book(s, s.uncovered, { customerEmail: MEMBER.email })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/doesn't include/),
    });
    expect(await sessionsUsed(s.cycleId)).toBe(0);
    const rows = await db
      .select()
      .from(schema.booking)
      .where(eq(schema.booking.organizationId, s.f.orgId));
    expect(rows).toHaveLength(0);
  });

  it('consumes a credit for a covered service and stores it as covered, not unpaid', async () => {
    const s = await setup();
    const res = await book(s, s.covered, { customerEmail: 'MEERA@Example.com' });
    expect(res).toMatchObject({ amountCents: 0, requiresPayment: false, status: 'confirmed' });
    expect(await sessionsUsed(s.cycleId)).toBe(1);
    const [row] = await db.select().from(schema.booking).where(eq(schema.booking.id, res.id));
    expect(row).toMatchObject({
      paymentStatus: 'covered',
      paymentProvider: 'membership',
      amountCents: 0,
      customerName: MEMBER.name,
    });
    // Phone also proves membership (normalized).
    await book(s, s.covered, { customerPhone: '+91 98765-43210' }, '11:00');
    expect(await sessionsUsed(s.cycleId)).toBe(2);
  });

  it('rejects a booker whose email/phone does not match the member', async () => {
    const s = await setup();
    await expect(
      book(s, s.covered, { customerEmail: 'stranger@example.com', customerPhone: '9123456780' }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/email or phone/),
    });
    await expect(book(s, s.covered, {})).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await sessionsUsed(s.cycleId)).toBe(0);
  });

  it('re-checks the service atomically in the credit statement', async () => {
    const s = await setup();
    const { start } = slotOn(s.f, 3, '10:00');
    const values = {
      id: uid('bkg'),
      organizationId: s.f.orgId,
      locationId: s.f.locationId,
      resourceId: s.f.resourceId,
      serviceId: s.uncovered,
      customerName: MEMBER.name,
      slotStart: start,
      slotEnd: new Date(start.getTime() + 30 * 60_000),
      currency: 'INR',
    };
    await expect(insertCoveredBooking(db, s.cycleId, values)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(await sessionsUsed(s.cycleId)).toBe(0);
  });

  it('sends timestamps to raw SQL as UTC strings, not driver-serialized Dates', async () => {
    const s = await setup();
    const { start } = slotOn(s.f, 3, '12:00');
    const end = new Date(start.getTime() + 30 * 60_000);
    const params: unknown[] = [];
    const dialect = (
      db as unknown as { dialect: { sqlToQuery(q: unknown): { params: unknown[] } } }
    ).dialect;
    const execute = db.execute.bind(db);
    vi.spyOn(db, 'execute').mockImplementation(((q: Parameters<Db['execute']>[0]) => {
      params.push(...dialect.sqlToQuery(q).params);
      return execute(q);
    }) as Db['execute']);
    const id = uid('bkg');
    await insertCoveredBooking(db, s.cycleId, {
      id,
      organizationId: s.f.orgId,
      locationId: s.f.locationId,
      resourceId: s.f.resourceId,
      serviceId: s.covered,
      customerName: MEMBER.name,
      slotStart: start,
      slotEnd: end,
      currency: 'INR',
    });
    expect(params.some((p) => p instanceof Date)).toBe(false);
    expect(params).toContain(start.toISOString());
    const [row] = await db.select().from(schema.booking).where(eq(schema.booking.id, id));
    expect(row!.slotStart.toISOString()).toBe(start.toISOString());
    expect(row!.slotEnd.toISOString()).toBe(end.toISOString());
  });
});

describe('public membership.benefit', () => {
  it('returns plan coverage only — no member name or contact', async () => {
    const s = await setup();
    const res = await publicCaller(db).membership.benefit({
      orgSlug: s.f.slug,
      subscriptionId: s.subId,
    });
    expect(res).toMatchObject({ planName: 'Yoga Monthly', remaining: 3, serviceIds: [s.covered] });
    expect(Object.keys(res!).sort()).toEqual(['planName', 'remaining', 'serviceIds', 'until']);
    const json = JSON.stringify(res);
    for (const v of [MEMBER.name, MEMBER.email, MEMBER.phone]) expect(json).not.toContain(v);
  });
});

describe('contactMatchesMember', () => {
  const member = { email: 'a@example.com', phone: '9876543210' };
  it('matches case-insensitive email or normalized phone', () => {
    expect(contactMatchesMember(member, { email: ' A@Example.COM' })).toBe(true);
    expect(contactMatchesMember(member, { phone: '+91 98765 43210' })).toBe(true);
    expect(contactMatchesMember(member, { phone: '098765-43210' })).toBe(true);
    expect(contactMatchesMember(member, { email: 'b@example.com', phone: '9123456789' })).toBe(
      false,
    );
    expect(contactMatchesMember(member, {})).toBe(false);
    expect(contactMatchesMember({ email: null, phone: null }, { email: '', phone: '' })).toBe(
      false,
    );
  });
});

describe('reminders', () => {
  it('sends no pay link for a membership booking of a priced service', async () => {
    vi.stubEnv('CASHFREE_CLIENT_ID', 'cf_test');
    const s = await setup();
    const member = await book(s, s.covered, { customerEmail: MEMBER.email }, '10:00');
    await db
      .update(schema.tenantSettings)
      .set({ enableWhatsapp: true })
      .where(eq(schema.tenantSettings.organizationId, s.f.orgId));
    await db
      .update(schema.booking)
      .set({ customerPhone: MEMBER.phone })
      .where(eq(schema.booking.id, member.id));
    // Same slot window: a priced pay-at-venue booking (should get a link)
    // and an unpaid booking whose own amount is 0 (should not, even though
    // the catalog price is 30,000).
    const { start } = slotOn(s.f, 2, '10:30');
    const base = {
      organizationId: s.f.orgId,
      locationId: s.f.locationId,
      resourceId: s.f.resourceId,
      serviceId: s.uncovered,
      customerName: 'Other',
      customerPhone: '9000000001',
      status: 'confirmed' as const,
      currency: 'INR',
    };
    const priced = uid('bkg');
    const free = uid('bkg');
    await db.insert(schema.booking).values([
      {
        ...base,
        id: priced,
        slotStart: start,
        slotEnd: new Date(start.getTime() + 30 * 60_000),
        amountCents: 30_000,
      },
      {
        ...base,
        id: free,
        slotStart: new Date(start.getTime() + 30 * 60_000),
        slotEnd: new Date(start.getTime() + 60 * 60_000),
        amountCents: 0,
      },
    ]);

    const sent: Array<{ to: string; template: string; buttons: unknown[] }> = [];
    const whatsApp = vi.fn(async (msg: { to: string; template: string; buttons: unknown[] }) => {
      sent.push(msg);
    });
    // Window is [now+23h, now+25h): covers 10:00, 10:30 and 11:00.
    const now = new Date(start.getTime() - 24 * 60 * 60_000);
    await runReminders(db, {
      appUrl: 'https://app.test',
      now,
      senders: {
        whatsApp: whatsApp as never,
        sms: vi.fn() as never,
      },
    });
    const byBooking = (bookingId: string) =>
      sent.find((m) => JSON.stringify(m.buttons).includes(bookingId));
    expect(byBooking(member.id)?.template).toBe(REMINDER_TEMPLATE);
    expect(JSON.stringify(byBooking(member.id))).not.toContain('/pay/');
    expect(byBooking(free)?.template).toBe(REMINDER_TEMPLATE);
    expect(byBooking(priced)?.template).toBe(REMINDER_PAY_TEMPLATE);
  });
});
