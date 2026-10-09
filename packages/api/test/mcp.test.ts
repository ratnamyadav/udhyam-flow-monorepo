import { schema } from '@udyamflow/db';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { type OwnerIdentity, ownerMcpHandler, publicMcpHandler } from '../src/mcp';
import { addMember, addService, createTestDb, seedOrg, slotOn, uid } from './helpers/harness';

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
const appUrl = 'https://app.test';

beforeAll(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.CASHFREE_CLIENT_ID;
  db = await createTestDb();
});

let rpcId = 0;
let ipSeq = 0;
async function rpc(
  handler: ReturnType<typeof ownerMcpHandler>,
  method: string,
  params: unknown,
  identity?: OwnerIdentity,
) {
  const res = await handler.fetch(
    new Request(`${appUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        'x-real-ip': `10.77.0.${++ipSeq % 250}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    }),
    identity
      ? {
          authInfo: {
            token: 't',
            clientId: 'c',
            scopes: [...identity.scopes],
            extra: { identity },
          },
        }
      : undefined,
  );
  const text = await res.text();
  const data = text.split('\n').find((l) => l.startsWith('data: '));
  return JSON.parse(data ? data.slice(6) : text);
}

async function call(
  handler: ReturnType<typeof ownerMcpHandler>,
  name: string,
  args: Record<string, unknown>,
  identity?: OwnerIdentity,
) {
  const msg = await rpc(handler, 'tools/call', { name, arguments: args }, identity);
  const result = msg.result as { isError?: boolean; content: { text: string }[] };
  const text = result.content[0]!.text;
  return { isError: !!result.isError, text, data: result.isError ? null : JSON.parse(text) };
}

describe('owner MCP server', () => {
  const owner = () => ownerMcpHandler({ db, appUrl });

  it('read-only tokens see no write tools; write tokens can book', async () => {
    const f = await seedOrg(db);
    const readOnly = { userId: f.ownerId, organizationId: f.orgId, scopes: ['workspace:read'] };
    const writer = { ...readOnly, scopes: ['workspace:read', 'workspace:write'] };

    const listed = await rpc(owner(), 'tools/list', {}, readOnly);
    const names = listed.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_schedule');
    expect(names).not.toContain('create_booking');

    const overview = await call(owner(), 'get_business_overview', {}, readOnly);
    expect(overview.data.staff[0].staffId).toBe(f.resourceId);
    expect(overview.data.canMakeChanges).toBe(false);

    const { date } = slotOn(f, 1, '00:00');
    const booked = await call(
      owner(),
      'create_booking',
      {
        staffId: f.resourceId,
        date,
        time: '11:15',
        customerName: 'Priya Shah',
        customerPhone: '9999999999',
        notifyCustomer: false,
      },
      writer,
    );
    expect(booked.isError).toBe(false);
    expect(booked.data).toMatchObject({ date, time: '11:15' });
    const [row] = await db
      .select()
      .from(schema.booking)
      .where(eq(schema.booking.id, booked.data.bookingId));
    expect(row!.source).toBe('assistant');

    const schedule = await call(owner(), 'get_schedule', { date }, readOnly);
    expect(schedule.data.bookings.map((b: { customer: string }) => b.customer)).toEqual([
      'Priya Shah',
    ]);

    const taken = await call(
      owner(),
      'create_booking',
      { staffId: f.resourceId, date, time: '11:30', customerName: 'Clash Person' },
      writer,
    );
    expect(taken.isError).toBe(true);
  });

  it('a token for a workspace the user is not (or no longer) in gets nothing', async () => {
    const a = await seedOrg(db);
    const b = await seedOrg(db);
    const foreign = { userId: a.ownerId, organizationId: b.orgId, scopes: ['workspace:read'] };
    const res = await call(owner(), 'get_schedule', {}, foreign);
    expect(res.isError).toBe(true);

    const memberId = uid('usr');
    await addMember(db, a.orgId, memberId, 'member');
    const member = { userId: memberId, organizationId: a.orgId, scopes: ['workspace:read'] };
    expect((await call(owner(), 'get_schedule', {}, member)).isError).toBe(false);
    await db
      .delete(schema.member)
      .where(and(eq(schema.member.userId, memberId), eq(schema.member.organizationId, a.orgId)));
    expect((await call(owner(), 'get_schedule', {}, member)).isError).toBe(true);
  });

  it('refuses requests without a verified identity', async () => {
    const res = await owner().fetch(
      new Request(`${appUrl}/api/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('public MCP server', () => {
  const pub = () => publicMcpHandler({ db, appUrl });

  it('finds a business, lists times and books it; opted-out businesses are hidden', async () => {
    const f = await seedOrg(db);
    const unique = `Zylo ${uid('biz')}`;
    await db
      .update(schema.organization)
      .set({ name: unique })
      .where(eq(schema.organization.id, f.orgId));
    const serviceId = await addService(db, f.orgId, { durationMin: 30 });

    const found = await call(pub(), 'find_business', { query: unique.slice(0, 12) });
    const match = found.data.find((b: { business: string }) => b.business === f.slug);
    expect(match).toMatchObject({ name: unique, bookingPage: `${appUrl}/book/${f.slug}` });

    const { date } = slotOn(f, 2, '00:00');
    const times = await call(pub(), 'find_open_times', { business: f.slug, date, serviceId });
    expect(times.data.staff[0].times).toContain('10:00');

    const noContact = await call(pub(), 'book_appointment', {
      business: f.slug,
      staffId: f.resourceId,
      serviceId,
      date,
      time: '10:00',
      customerName: 'Ravi Kumar',
    });
    expect(noContact.isError).toBe(true);

    const booked = await call(pub(), 'book_appointment', {
      business: f.slug,
      staffId: f.resourceId,
      serviceId,
      date,
      time: '10:00',
      customerName: 'Ravi Kumar',
      customerEmail: 'ravi@example.com',
    });
    expect(booked.data).toMatchObject({ status: 'confirmed', time: '10:00' });
    const status = await call(pub(), 'check_booking', { bookingId: booked.data.bookingId });
    expect(status.data).toMatchObject({ status: 'confirmed', date, time: '10:00' });
    const [row] = await db
      .select()
      .from(schema.booking)
      .where(eq(schema.booking.id, booked.data.bookingId));
    expect(row!.source).toBe('ai-assistant');

    await db
      .update(schema.tenantSettings)
      .set({ assistantBooking: false })
      .where(eq(schema.tenantSettings.organizationId, f.orgId));
    const hidden = await call(pub(), 'find_business', { query: unique.slice(0, 12) });
    expect(hidden.data.find((b: { business: string }) => b.business === f.slug)).toBeUndefined();
    const blocked = await call(pub(), 'get_booking_options', { business: f.slug });
    expect(blocked.isError).toBe(true);
  });
});
