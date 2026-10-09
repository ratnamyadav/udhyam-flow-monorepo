import { McpServer } from '@modelcontextprotocol/server';
import { type Db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dayWindowUtc, formatInTz, todayInTz } from '../lib/time';
import { dateStr, hhmm } from '../lib/validate';
import { appRouter } from '../router';
import { bookingUrlFor } from '../source';
import type { Context } from '../trpc';
import { money, run } from './shared';

// The owner/staff MCP server: what a business owner's own assistant (Claude,
// ChatGPT, …) can do in their workspace. Every tool goes through the same
// tRPC procedures as the dashboard, so membership, role checks, rate limits
// and the double-booking constraint all apply unchanged.

export type OwnerIdentity = {
  userId: string;
  organizationId: string;
  scopes: readonly string[];
};

type BookingRow = typeof schema.booking.$inferSelect;
type Names = { staff: Map<string, string>; service: Map<string, string>; timezone: string };

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const notify = z
  .boolean()
  .default(true)
  .describe('Send the customer an SMS/WhatsApp/email about it (default true).');

function bookingView(b: BookingRow, n: Names, tz: string) {
  return {
    bookingId: b.id,
    date: formatInTz(b.slotStart, tz, 'yyyy-MM-dd'),
    time: formatInTz(b.slotStart, tz, 'HH:mm'),
    endTime: formatInTz(b.slotEnd, tz, 'HH:mm'),
    customer: b.customerName,
    customerId: b.customerId,
    phone: b.customerPhone,
    email: b.customerEmail,
    staff: n.staff.get(b.resourceId) ?? null,
    staffId: b.resourceId,
    service: b.serviceId ? (n.service.get(b.serviceId) ?? null) : null,
    status: b.status,
    payment: b.paymentStatus,
    price: money(b.amountCents, b.currency),
    source: b.source,
    meetingUrl: b.meetingUrl,
  };
}

export function createOwnerMcpServer(opts: {
  db: Db;
  headers: Headers;
  identity: OwnerIdentity;
  appUrl: string;
}): McpServer {
  const { db, identity } = opts;
  // The token's user, acting in the token's workspace. tenantProcedure
  // re-checks the membership on every call.
  const caller = appRouter.createCaller({
    db,
    headers: opts.headers,
    session: {
      user: { id: identity.userId, role: 'user' },
      session: {
        id: 'mcp',
        userId: identity.userId,
        activeOrganizationId: identity.organizationId,
      },
    },
  } as unknown as Context);
  const canWrite = identity.scopes.includes('workspace:write');

  const server = new McpServer(
    { name: 'udyamflow', title: 'UdyamFlow', version: '1.0.0' },
    {
      instructions: [
        "UdyamFlow is this business's booking system.",
        'Start with get_business_overview to learn the locations, staff (staffId) and services (serviceId).',
        "Dates are YYYY-MM-DD and times are 24-hour HH:mm in the location's own timezone — pass them as the user says them, never convert.",
        canWrite
          ? 'Confirm the details with the user before creating, moving or cancelling a booking, or blocking time.'
          : 'This connection is read-only.',
      ].join(' '),
    },
  );

  async function names(): Promise<Names> {
    const [resources, services, locations] = await Promise.all([
      caller.resource.list(),
      caller.service.list(),
      caller.location.list(),
    ]);
    return {
      staff: new Map(resources.map((r) => [r.id, r.name])),
      service: new Map(services.map((s) => [s.id, s.name])),
      // ponytail: the first location's timezone frames date-range filters;
      // per-row times always use the booking's own location.
      timezone: locations[0]?.timezone ?? 'UTC',
    };
  }

  server.registerTool(
    'get_business_overview',
    {
      title: 'Business overview',
      description:
        'Locations, staff and services with their ids, plus the public booking link. Call this first.',
      annotations: READ,
    },
    () =>
      run(async () => {
        const [locations, resources, services] = await Promise.all([
          caller.location.list(),
          caller.resource.list(),
          caller.service.list(),
        ]);
        const [org] = await db
          .select({ name: schema.organization.name, slug: schema.organization.slug })
          .from(schema.organization)
          .where(eq(schema.organization.id, identity.organizationId));
        return {
          business: org?.name,
          bookingLink: org ? bookingUrlFor(opts.appUrl, org.slug) : null,
          today: locations[0] ? todayInTz(locations[0].timezone) : null,
          locations: locations.map((l) => ({
            locationId: l.id,
            name: l.name,
            address: l.address,
            timezone: l.timezone,
          })),
          staff: resources.map((r) => ({
            staffId: r.id,
            name: r.name,
            title: r.title,
            locationId: r.locationId,
          })),
          services: services.map((s) => ({
            serviceId: s.id,
            name: s.name,
            durationMin: s.durationMin,
            price: money(s.priceCents, s.currency),
            online: s.isOnline,
            // Empty = every staff member offers it.
            staffIds: s.resourceIds,
          })),
          canMakeChanges: canWrite,
        };
      }),
  );

  server.registerTool(
    'get_schedule',
    {
      title: 'Day schedule',
      description:
        "Every active booking on one day at one location (default: today at the first location), in time order. Cancelled bookings aren't listed.",
      inputSchema: z.object({
        date: dateStr.optional().describe('YYYY-MM-DD; defaults to today.'),
        locationId: z.string().optional(),
      }),
      annotations: READ,
    },
    ({ date, locationId }) =>
      run(async () => {
        const [day, n] = await Promise.all([
          caller.booking.listToday({ date, locationId }),
          names(),
        ]);
        return {
          date: day.date,
          timezone: day.timezone,
          bookings: day.bookings.map((b) => bookingView(b, n, day.timezone)),
        };
      }),
  );

  server.registerTool(
    'list_bookings',
    {
      title: 'Find bookings',
      description:
        'Bookings in a date range (inclusive), optionally by status or staff member, oldest first. Keep ranges narrow — at most 200 are scanned.',
      inputSchema: z.object({
        fromDate: dateStr.optional(),
        toDate: dateStr.optional(),
        status: z
          .enum(['pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired'])
          .optional(),
        staffId: z.string().optional(),
      }),
      annotations: READ,
    },
    ({ fromDate, toDate, status, staffId }) =>
      run(async () => {
        const n = await names();
        const rows = await caller.booking.list({
          from: fromDate ? dayWindowUtc(fromDate, n.timezone).start.toISOString() : undefined,
          to: toDate ? dayWindowUtc(toDate, n.timezone).end.toISOString() : undefined,
          status,
          resourceId: staffId,
          limit: 200,
          offset: 0,
        });
        return rows
          .reverse()
          .map((b) => ({ ...bookingView(b, n, b.timezone), timezone: b.timezone }));
      }),
  );

  server.registerTool(
    'get_booking',
    {
      title: 'Booking details',
      description: 'One booking, including intake answers the customer gave.',
      inputSchema: z.object({ bookingId: z.string() }),
      annotations: READ,
    },
    ({ bookingId }) =>
      run(async () => {
        const [b, n] = await Promise.all([caller.booking.get({ id: bookingId }), names()]);
        return {
          ...bookingView(b, n, b.timezone),
          timezone: b.timezone,
          location: b.locationName,
          intake: b.intake,
          cancelReason: b.cancelReason,
          confirmedByCustomer: !!b.customerConfirmedAt,
        };
      }),
  );

  server.registerTool(
    'find_open_slots',
    {
      title: 'Free times',
      description:
        'Free start times on a date for each staff member, within working hours and avoiding bookings and time off. Staff can still book other times with create_booking if nothing overlaps.',
      inputSchema: z.object({
        date: dateStr,
        serviceId: z.string().optional().describe('Only staff who offer it; sets the length.'),
        staffId: z.string().optional(),
      }),
      annotations: READ,
    },
    ({ date, serviceId, staffId }) =>
      run(async () => {
        const res = await caller.booking.openSlots({ date, serviceId, resourceId: staffId });
        return {
          date: res.date,
          staff: res.resources.map((r) => ({
            staffId: r.resourceId,
            name: r.resourceName,
            timezone: r.timezone,
            durationMin: r.durationMin,
            times: r.slots.map((s) => s.displayTime),
          })),
        };
      }),
  );

  server.registerTool(
    'search_customers',
    {
      title: 'Search customers',
      description: 'Customers matching a name, email or phone fragment (most recent first).',
      inputSchema: z.object({
        query: z.string().trim().max(100).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      annotations: READ,
    },
    ({ query, limit }) =>
      run(async () => {
        const rows = await caller.customer.list({ query: query || undefined, limit, offset: 0 });
        return rows.map((c) => ({
          customerId: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          lastBookingAt: c.lastBookingAt,
          notes: c.notes,
        }));
      }),
  );

  server.registerTool(
    'get_customer',
    {
      title: 'Customer details',
      description: 'A customer with notes and their 20 most recent bookings.',
      inputSchema: z.object({ customerId: z.string() }),
      annotations: READ,
    },
    ({ customerId }) =>
      run(async () => {
        const [c, bookings, n] = await Promise.all([
          caller.customer.get({ id: customerId }),
          caller.customer.listBookings({ id: customerId }),
          names(),
        ]);
        return {
          customerId: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          notes: c.notes,
          bookings: bookings.slice(0, 20).map((b) => bookingView(b, n, n.timezone)),
        };
      }),
  );

  server.registerTool(
    'get_business_summary',
    {
      title: 'How business is going',
      description:
        'Bookings this week vs last week, revenue month-to-date, and staff utilization over the last 7 days.',
      annotations: READ,
    },
    () =>
      run(async () => {
        const [weekly, revenue, utilization] = await Promise.all([
          caller.report.weekly(),
          caller.report.revenueMtd(),
          caller.report.utilization7d(),
        ]);
        return { weekly, revenue, utilization };
      }),
  );

  server.registerTool(
    'list_time_off',
    {
      title: 'Time off',
      description: 'Current and upcoming blocked time (holidays, leave, breaks).',
      annotations: READ,
    },
    () =>
      run(async () => {
        const rows = await caller.timeOff.list();
        return rows.map((t) => ({
          timeOffId: t.id,
          who: t.resourceName ?? `Everyone at ${t.locationName}`,
          from: formatInTz(t.startsAt, t.timezone, 'yyyy-MM-dd HH:mm'),
          until: formatInTz(t.endsAt, t.timezone, 'yyyy-MM-dd HH:mm'),
          timezone: t.timezone,
          reason: t.reason,
        }));
      }),
  );

  if (!canWrite) return server;

  server.registerTool(
    'create_booking',
    {
      title: 'Book an appointment',
      description:
        'Book a customer (phone call, walk-in, message). Any time works as long as the staff member is free; payment, if any, is collected at the venue.',
      inputSchema: z.object({
        staffId: z.string(),
        serviceId: z.string().optional(),
        date: dateStr,
        time: hhmm,
        durationMin: z
          .number()
          .int()
          .min(5)
          .max(720)
          .optional()
          .describe("Defaults to the service's length."),
        customerName: z.string().trim().min(2).max(120),
        customerPhone: z.string().trim().max(32).optional(),
        customerEmail: z.email().optional(),
        notifyCustomer: notify,
      }),
      annotations: WRITE,
    },
    (input) =>
      run(async () => {
        const res = await caller.booking.createByStaff({
          resourceId: input.staffId,
          serviceId: input.serviceId,
          date: input.date,
          time: input.time,
          durationMin: input.durationMin,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail,
          notifyCustomer: input.notifyCustomer,
          source: 'assistant',
        });
        return {
          bookingId: res.id,
          reference: res.referenceCode,
          staff: res.resourceName,
          date: formatInTz(res.slotStart, res.timezone, 'yyyy-MM-dd'),
          time: formatInTz(res.slotStart, res.timezone, 'HH:mm'),
          endTime: formatInTz(res.slotEnd, res.timezone, 'HH:mm'),
          meetingUrl: res.meetingUrl,
        };
      }),
  );

  server.registerTool(
    'reschedule_booking',
    {
      title: 'Move a booking',
      description: 'Move a confirmed booking to another date/time, keeping its length and price.',
      inputSchema: z.object({
        bookingId: z.string(),
        date: dateStr,
        time: hhmm,
        notifyCustomer: notify,
      }),
      annotations: WRITE,
    },
    ({ bookingId, date, time, notifyCustomer }) =>
      run(async () => {
        const res = await caller.booking.reschedule({ id: bookingId, date, time, notifyCustomer });
        return {
          bookingId,
          date: formatInTz(res.slotStart, res.timezone, 'yyyy-MM-dd'),
          time: formatInTz(res.slotStart, res.timezone, 'HH:mm'),
          endTime: formatInTz(res.slotEnd, res.timezone, 'HH:mm'),
        };
      }),
  );

  server.registerTool(
    'cancel_booking',
    {
      title: 'Cancel a booking',
      description:
        "Cancel a booking and tell the customer. Doesn't refund — refunds are done in the UdyamFlow dashboard.",
      inputSchema: z.object({
        bookingId: z.string(),
        reason: z.string().trim().max(500).optional(),
      }),
      annotations: { ...WRITE, destructiveHint: true },
    },
    ({ bookingId, reason }) =>
      run(async () => {
        await caller.booking.cancel({ id: bookingId, reason, refund: false });
        return { bookingId, status: 'cancelled' };
      }),
  );

  server.registerTool(
    'mark_booking_completed',
    {
      title: 'Mark completed',
      description: 'Record that a confirmed appointment happened.',
      inputSchema: z.object({ bookingId: z.string() }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ bookingId }) => run(() => caller.booking.markComplete({ id: bookingId })),
  );

  server.registerTool(
    'mark_no_show',
    {
      title: 'Mark no-show',
      description: "Record that the customer didn't turn up.",
      inputSchema: z.object({ bookingId: z.string() }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ bookingId }) => run(() => caller.booking.markNoShow({ id: bookingId })),
  );

  server.registerTool(
    'block_time',
    {
      title: 'Block time off',
      description:
        "Block a holiday, leave or break so it can't be booked. Without times it blocks whole days (startDate through endDate). Give a staffId for one person, a locationId for everyone there, or neither if the business has one location. Existing bookings in the window are returned, not cancelled.",
      inputSchema: z.object({
        staffId: z.string().optional(),
        locationId: z.string().optional(),
        startDate: dateStr,
        endDate: dateStr.optional(),
        startTime: hhmm.optional(),
        endTime: hhmm.optional(),
        reason: z.string().trim().max(200).optional(),
      }),
      annotations: WRITE,
    },
    (input) =>
      run(async () => {
        const res = await caller.timeOff.add({
          resourceId: input.staffId,
          locationId: input.locationId,
          startDate: input.startDate,
          endDate: input.endDate,
          startTime: input.startTime,
          endTime: input.endTime,
          reason: input.reason,
        });
        return {
          timeOffId: res.id,
          from: formatInTz(res.startsAt, res.timezone, 'yyyy-MM-dd HH:mm'),
          until: formatInTz(res.endsAt, res.timezone, 'yyyy-MM-dd HH:mm'),
          existingBookings: res.conflicts.map((c) => ({
            bookingId: c.id,
            customer: c.customerName,
            staff: c.resourceName,
            date: formatInTz(c.slotStart, res.timezone, 'yyyy-MM-dd'),
            time: formatInTz(c.slotStart, res.timezone, 'HH:mm'),
          })),
        };
      }),
  );

  server.registerTool(
    'remove_time_off',
    {
      title: 'Remove time off',
      description: 'Unblock time added with block_time.',
      inputSchema: z.object({ timeOffId: z.string() }),
      annotations: { ...WRITE, destructiveHint: true },
    },
    ({ timeOffId }) => run(() => caller.timeOff.remove({ id: timeOffId })),
  );

  server.registerTool(
    'add_customer_note',
    {
      title: 'Add a customer note',
      description: "Append a dated note to a customer's record (existing notes are kept).",
      inputSchema: z.object({
        customerId: z.string(),
        note: z.string().trim().min(1).max(1000),
      }),
      annotations: WRITE,
    },
    ({ customerId, note }) =>
      run(async () => {
        const [c, n] = await Promise.all([caller.customer.get({ id: customerId }), names()]);
        const line = `${todayInTz(n.timezone)}: ${note}`;
        const notes = c.notes ? `${c.notes}\n${line}` : line;
        await caller.customer.update({ id: customerId, notes });
        return { customerId, notes };
      }),
  );

  return server;
}
