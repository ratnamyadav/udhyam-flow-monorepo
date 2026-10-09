import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  BOOKING_STATUSES,
  type BookingStatus,
  type Db,
  isConflictError,
  SLOT_BLOCKING_STATUSES,
  schema,
} from '@udyamflow/db';
import { PROFESSIONS, type ProfessionId } from '@udyamflow/tokens';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { verifyBookingManagementToken } from '../booking-management';
import { generateSlots, type Interval, overlaps, type Slot } from '../lib/slots';
import {
  addDaysToDate,
  dayOfWeek,
  dayWindowUtc,
  formatInTz,
  hhmmToMinutes,
  isValidDateStr,
  todayInTz,
  wallTimeToUtc,
} from '../lib/time';
import { dateStr, hhmm } from '../lib/validate';
import { notifyCancelled, notifyConfirmed, referenceCodeFor } from '../notify';
import { resolveMeetingUrl } from '../online';
import { expireStaleHolds, refundBooking } from '../payments/lifecycle';
import { HOLD_MINUTES, pickProvider } from '../payments/providers';
import { enforceRateLimit, ipKeyFromHeaders } from '../rate-limit';
import { sanitizeSource } from '../source';
import { publicProcedure, router, tenantProcedure } from '../trpc';
import { upsertCustomer } from './customer';
import { timeOffIntervals } from './time-off';

// How far ahead customers can book, in days.
const BOOKING_HORIZON_DAYS = 90;
// Staff (and their assistants) can book off-grid and outside hours, but only
// within this window — a guard against year-off typos and timezone slips.
const STAFF_PAST_MS = 24 * 60 * 60 * 1000;
const STAFF_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

type Bookable = {
  orgId: string;
  orgName: string;
  timezone: string;
  locationId: string;
  resourceId: string;
  resourceName: string;
  resourceMeetingUrl: string | null;
  service: typeof schema.service.$inferSelect | null;
  // Services this resource offers. When non-zero, a booking must pick one —
  // otherwise a paid service could be skipped entirely.
  eligibleServiceCount: number;
  slotMin: number;
};

type Resolved =
  | { ok: true; value: Bookable }
  | { ok: false; code: 'NOT_FOUND' | 'BAD_REQUEST'; message: string };

// Resolves and cross-checks every id a caller hands us: the location,
// resource and service must all belong to the org (named by slug for public
// callers, by id for staff), the resource must sit at that location, and it
// must offer that service. Staff may omit the location — the resource's own
// is used.
async function resolveBookable(
  db: Db,
  input: {
    orgSlug?: string;
    orgId?: string;
    locationId?: string;
    resourceId: string;
    serviceId?: string;
  },
): Promise<Resolved> {
  const [org] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      profession: schema.tenantSettings.profession,
    })
    .from(schema.organization)
    .leftJoin(
      schema.tenantSettings,
      eq(schema.tenantSettings.organizationId, schema.organization.id),
    )
    .where(
      input.orgId
        ? eq(schema.organization.id, input.orgId)
        : eq(schema.organization.slug, input.orgSlug ?? ''),
    );
  if (!org) return { ok: false, code: 'NOT_FOUND', message: 'Business not found.' };

  const [resource] = await db
    .select({
      id: schema.resource.id,
      name: schema.resource.name,
      meetingUrl: schema.resource.meetingUrl,
      locationId: schema.location.id,
      timezone: schema.location.timezone,
    })
    .from(schema.resource)
    .innerJoin(schema.location, eq(schema.location.id, schema.resource.locationId))
    .where(
      and(
        eq(schema.resource.id, input.resourceId),
        eq(schema.resource.organizationId, org.id),
        isNull(schema.resource.archivedAt),
        input.locationId ? eq(schema.location.id, input.locationId) : undefined,
        isNull(schema.location.archivedAt),
      ),
    );
  if (!resource) {
    return { ok: false, code: 'NOT_FOUND', message: 'That provider is not available here.' };
  }

  const services = await db
    .select()
    .from(schema.service)
    .where(and(eq(schema.service.organizationId, org.id), isNull(schema.service.archivedAt)));
  const links =
    services.length > 0
      ? await db
          .select()
          .from(schema.serviceResource)
          .where(
            inArray(
              schema.serviceResource.serviceId,
              services.map((s) => s.id),
            ),
          )
      : [];
  // A service with no linked resources is offered by every resource.
  const eligible = services.filter((s) => {
    const linked = links.filter((l) => l.serviceId === s.id);
    return linked.length === 0 || linked.some((l) => l.resourceId === resource.id);
  });

  let service: Bookable['service'] = null;
  if (input.serviceId) {
    service = eligible.find((s) => s.id === input.serviceId) ?? null;
    if (!service) {
      return { ok: false, code: 'BAD_REQUEST', message: 'That service is not offered here.' };
    }
  }

  const profession = PROFESSIONS[org.profession as ProfessionId] ?? PROFESSIONS.doctor;
  return {
    ok: true,
    value: {
      orgId: org.id,
      orgName: org.name,
      timezone: resource.timezone,
      locationId: resource.locationId,
      resourceId: resource.id,
      resourceName: resource.name,
      resourceMeetingUrl: resource.meetingUrl,
      service,
      eligibleServiceCount: eligible.length,
      slotMin: service?.durationMin ?? profession.slotDuration,
    },
  };
}

function isWithinHorizon(date: string, timezone: string, now: Date): boolean {
  const today = todayInTz(timezone, now);
  return (
    isValidDateStr(date) && date >= today && date <= addDaysToDate(today, BOOKING_HORIZON_DAYS)
  );
}

// Everything that makes a resource unavailable in [start, end): slot-
// occupying bookings (minus `excludeBookingId`, the one being moved) and
// blocked time.
async function takenIntervals(
  db: Db,
  b: { locationId: string; resourceId: string },
  window: Interval,
  excludeBookingId?: string,
): Promise<Interval[]> {
  await expireStaleHolds(db, b.resourceId);
  const rows = await db
    .select({ start: schema.booking.slotStart, end: schema.booking.slotEnd })
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.resourceId, b.resourceId),
        inArray(schema.booking.status, [...SLOT_BLOCKING_STATUSES]),
        lt(schema.booking.slotStart, window.end),
        gt(schema.booking.slotEnd, window.start),
        excludeBookingId ? ne(schema.booking.id, excludeBookingId) : undefined,
      ),
    );
  return [...rows, ...(await timeOffIntervals(db, b, window))];
}

function assertStaffWindow(start: Date, now = new Date()) {
  const t = start.getTime() - now.getTime();
  if (t < -STAFF_PAST_MS || t > STAFF_FUTURE_MS) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Pick a time between yesterday and a year from now.',
    });
  }
}

const slotTakenError = () =>
  new TRPCError({ code: 'CONFLICT', message: 'That slot was just taken — please pick another.' });

// Inserts a booking for a resolved resource. The DB exclusion constraint is
// the real race guard; a conflict there becomes a CONFLICT error.
async function insertBooking(
  db: Db,
  b: Bookable,
  args: {
    slotStart: Date;
    slotEnd: Date;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    intake?: Record<string, unknown>;
    status: BookingStatus;
    holdExpiresAt: Date | null;
    source: string | null;
  },
) {
  const customerId = await upsertCustomer(db, b.orgId, {
    name: args.customerName,
    email: args.customerEmail,
    phone: args.customerPhone,
  });
  // Online services get a join link: the practitioner's own room if set,
  // else a generated Jitsi room.
  const meetingUrl = resolveMeetingUrl({
    serviceIsOnline: !!b.service?.isOnline,
    resourceMeetingUrl: b.resourceMeetingUrl,
  });
  const id = `bkg_${randomUUID()}`;
  try {
    await db.insert(schema.booking).values({
      id,
      organizationId: b.orgId,
      resourceId: b.resourceId,
      locationId: b.locationId,
      serviceId: b.service?.id,
      customerId,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      customerPhone: args.customerPhone,
      slotStart: args.slotStart,
      slotEnd: args.slotEnd,
      intake: args.intake,
      status: args.status,
      holdExpiresAt: args.holdExpiresAt,
      amountCents: b.service?.priceCents ?? 0,
      currency: b.service?.currency ?? null,
      meetingUrl,
      source: args.source,
    });
  } catch (err) {
    if (isConflictError(err)) throw slotTakenError();
    throw err;
  }
  return { id, meetingUrl };
}

// Moves a confirmed booking (compare-and-set on status + old start). The
// reminder flags reset so the customer is reminded about the new time.
async function moveBooking(
  db: Db,
  booking: { id: string; status: BookingStatus; slotStart: Date },
  start: Date,
  end: Date,
) {
  try {
    const updated = await db
      .update(schema.booking)
      .set({ slotStart: start, slotEnd: end, reminderSentAt: null, customerConfirmedAt: null })
      .where(
        and(
          eq(schema.booking.id, booking.id),
          eq(schema.booking.status, booking.status),
          eq(schema.booking.slotStart, booking.slotStart),
        ),
      )
      .returning({ id: schema.booking.id });
    if (!updated.length)
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This booking changed. Refresh and try again.',
      });
  } catch (error) {
    if (isConflictError(error))
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'That time was just taken. Choose another slot.',
      });
    throw error;
  }
}

// Candidate slots for a date from working hours alone (no availability).
async function candidateSlots(
  db: Db,
  b: Bookable,
  date: string,
  now: Date,
  taken: Interval[],
): Promise<Slot[]> {
  const [hours] = await db
    .select()
    .from(schema.resourceHours)
    .where(
      and(
        eq(schema.resourceHours.resourceId, b.resourceId),
        eq(schema.resourceHours.dayOfWeek, dayOfWeek(date)),
      ),
    );
  if (!hours) return [];
  return generateSlots({
    date,
    timezone: b.timezone,
    openMin: hours.openMin,
    closeMin: hours.closeMin,
    slotMin: b.slotMin,
    taken,
    now,
  });
}

const bookingStatus = z.enum(BOOKING_STATUSES);

const managementInput = z.object({
  bookingId: z.string().min(1).max(100),
  token: z.string().max(100),
});

async function loadManagedBooking(
  ctx: { db: Db; headers: Headers },
  input: z.infer<typeof managementInput>,
) {
  await enforceRateLimit({
    key: `manage:${ipKeyFromHeaders(ctx.headers)}`,
    limit: 20,
    windowSec: 60,
  });
  if (!verifyBookingManagementToken(input.bookingId, input.token)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This management link is invalid or expired. Contact the business.',
    });
  }
  const [booking] = await ctx.db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, input.bookingId));
  if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
  if (
    !['confirmed', 'pending_payment'].includes(booking.status) ||
    booking.slotStart.getTime() <= Date.now()
  ) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This appointment can no longer be changed online. Contact the business.',
    });
  }
  return booking;
}

export const bookingRouter = router({
  managementSlots: publicProcedure
    .input(managementInput.extend({ date: dateStr }))
    .query(async ({ ctx, input }) => {
      const booking = await loadManagedBooking(ctx, input);
      const [org] = await ctx.db
        .select()
        .from(schema.organization)
        .where(eq(schema.organization.id, booking.organizationId));
      const resolved = await resolveBookable(ctx.db, {
        orgSlug: org!.slug,
        resourceId: booking.resourceId,
        locationId: booking.locationId,
        serviceId: booking.serviceId ?? undefined,
      });
      if (!resolved.ok) throw new TRPCError({ code: resolved.code, message: resolved.message });
      const b = {
        ...resolved.value,
        slotMin: (booking.slotEnd.getTime() - booking.slotStart.getTime()) / 60_000,
      };
      const now = new Date();
      if (!isWithinHorizon(input.date, b.timezone, now)) return { slots: [], timezone: b.timezone };
      const taken = await takenIntervals(
        ctx.db,
        b,
        dayWindowUtc(input.date, b.timezone),
        booking.id,
      );
      return {
        slots: await candidateSlots(ctx.db, b, input.date, now, taken),
        timezone: b.timezone,
      };
    }),

  cancelPublic: publicProcedure
    .input(managementInput.extend({ reason: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await loadManagedBooking(ctx, input);
      await transition(ctx.db, booking, 'cancelled', {
        cancelReason: input.reason ?? 'Cancelled by customer',
      });
      await notifyCancelled(ctx.db, booking.id);
      return { ok: true as const, status: 'cancelled' as const };
    }),

  reschedulePublic: publicProcedure
    .input(managementInput.extend({ slotStart: z.iso.datetime() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await loadManagedBooking(ctx, input);
      if (booking.status !== 'confirmed')
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Complete payment or cancel the hold before choosing another time.',
        });
      const [org] = await ctx.db
        .select()
        .from(schema.organization)
        .where(eq(schema.organization.id, booking.organizationId));
      const resolved = await resolveBookable(ctx.db, {
        orgSlug: org!.slug,
        resourceId: booking.resourceId,
        locationId: booking.locationId,
        serviceId: booking.serviceId ?? undefined,
      });
      if (!resolved.ok) throw new TRPCError({ code: resolved.code, message: resolved.message });
      const b = {
        ...resolved.value,
        slotMin: (booking.slotEnd.getTime() - booking.slotStart.getTime()) / 60_000,
      };
      const now = new Date();
      const start = new Date(input.slotStart);
      const date = formatInTz(start, b.timezone, 'yyyy-MM-dd');
      const taken = await takenIntervals(ctx.db, b, dayWindowUtc(date, b.timezone), booking.id);
      const slots = isWithinHorizon(date, b.timezone, now)
        ? await candidateSlots(ctx.db, b, date, now, taken)
        : [];
      const slot = slots.find((s) => s.start === start.toISOString());
      if (!slot)
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'That time is unavailable. Choose another slot.',
        });
      await moveBooking(ctx.db, booking, start, new Date(slot.end));
      await notifyConfirmed(ctx.db, booking.id);
      return { ok: true as const };
    }),
  listSlots: publicProcedure
    .input(
      z.object({
        orgSlug: z.string(),
        locationId: z.string(),
        resourceId: z.string(),
        serviceId: z.string().optional(),
        date: dateStr.optional(), // defaults to today in the location's tz
      }),
    )
    .query(async ({ ctx, input }): Promise<{ slots: Slot[]; timezone: string; date: string }> => {
      await enforceRateLimit({
        key: `slots:${ipKeyFromHeaders(ctx.headers)}:${input.orgSlug}`,
        limit: 60,
        windowSec: 60,
      });
      const resolved = await resolveBookable(ctx.db, input);
      if (!resolved.ok) {
        return { slots: [], timezone: 'UTC', date: input.date ?? todayInTz('UTC') };
      }
      const b = resolved.value;
      const now = new Date();
      const date = input.date ?? todayInTz(b.timezone, now);
      if (!isWithinHorizon(date, b.timezone, now)) {
        return { slots: [], timezone: b.timezone, date };
      }
      const taken = await takenIntervals(ctx.db, b, dayWindowUtc(date, b.timezone));
      return {
        slots: await candidateSlots(ctx.db, b, date, now, taken),
        timezone: b.timezone,
        date,
      };
    }),

  create: publicProcedure
    .input(
      z.object({
        orgSlug: z.string(),
        resourceId: z.string(),
        locationId: z.string(),
        serviceId: z.string().optional(),
        customerName: z.string().trim().min(2).max(120),
        customerEmail: z.email().optional(),
        customerPhone: z.string().max(32).optional(),
        slotStart: z.iso.datetime(),
        // Ignored — the server derives the end from the service duration.
        slotEnd: z.iso.datetime().optional(),
        intake: z.record(z.string(), z.unknown()).optional(),
        // Raw `?source=` / `?utm_source=` from the booking link — sanitized
        // below (junk becomes null rather than failing the booking).
        source: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit({
        key: `create:${ipKeyFromHeaders(ctx.headers)}:${input.orgSlug}`,
        limit: 5,
        windowSec: 60,
        message: 'Too many booking attempts from your network. Please try again in a minute.',
      });

      const resolved = await resolveBookable(ctx.db, input);
      if (!resolved.ok) throw new TRPCError({ code: resolved.code, message: resolved.message });
      const b = resolved.value;
      if (b.eligibleServiceCount > 0 && !b.service) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Please choose a service.' });
      }

      // The requested start must be a real slot: inside working hours, on
      // the slot grid, in the future and within the booking horizon.
      const now = new Date();
      const slotStart = new Date(input.slotStart);
      const date = formatInTz(slotStart, b.timezone, 'yyyy-MM-dd');
      const candidates = isWithinHorizon(date, b.timezone, now)
        ? await candidateSlots(ctx.db, b, date, now, [])
        : [];
      const slot = candidates.find((s) => s.start === slotStart.toISOString());
      if (!slot) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That time is not bookable — please pick one of the listed slots.',
        });
      }
      const slotEnd = new Date(slot.end);
      const taken = await takenIntervals(ctx.db, b, { start: slotStart, end: slotEnd });
      if (taken.some((t) => overlaps(t, { start: slotStart, end: slotEnd }))) {
        throw slotTakenError();
      }

      const amountCents = b.service?.priceCents ?? 0;
      const currency = b.service?.currency ?? null;
      const provider = amountCents > 0 && currency ? pickProvider(currency) : 'none';
      // Price > 0 with no gateway configured = pay at the venue.
      const requiresPayment = provider !== 'none';
      const holdExpiresAt = requiresPayment
        ? new Date(now.getTime() + HOLD_MINUTES * 60_000)
        : null;

      const status: BookingStatus = requiresPayment ? 'pending_payment' : 'confirmed';
      const { id, meetingUrl } = await insertBooking(ctx.db, b, {
        slotStart,
        slotEnd,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        intake: input.intake,
        status,
        holdExpiresAt,
        source: sanitizeSource(input.source),
      });

      if (status === 'confirmed') await notifyConfirmed(ctx.db, id);
      return {
        id,
        referenceCode: referenceCodeFor(id),
        status: status as 'confirmed' | 'pending_payment',
        requiresPayment,
        amountCents,
        currency,
        holdExpiresAt,
        meetingUrl,
      };
    }),

  // Customer-facing status (confirmation pages, mobile polling). The booking
  // id is an unguessable UUID; nothing sensitive beyond what the customer
  // entered is returned.
  publicStatus: publicProcedure
    .input(z.object({ bookingId: z.string() }))
    .query(async ({ ctx, input }) => {
      await enforceRateLimit({
        key: `status:${ipKeyFromHeaders(ctx.headers)}`,
        limit: 60,
        windowSec: 60,
      });
      await expireStaleHolds(ctx.db);
      const [row] = await ctx.db
        .select({
          booking: schema.booking,
          resourceName: schema.resource.name,
          serviceName: schema.service.name,
          orgName: schema.organization.name,
          orgSlug: schema.organization.slug,
          timezone: schema.location.timezone,
        })
        .from(schema.booking)
        .innerJoin(schema.resource, eq(schema.resource.id, schema.booking.resourceId))
        .innerJoin(schema.location, eq(schema.location.id, schema.booking.locationId))
        .innerJoin(schema.organization, eq(schema.organization.id, schema.booking.organizationId))
        .leftJoin(schema.service, eq(schema.service.id, schema.booking.serviceId))
        .where(eq(schema.booking.id, input.bookingId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
      const bk = row.booking;
      return {
        id: bk.id,
        referenceCode: referenceCodeFor(bk.id),
        status: bk.status,
        paymentStatus: bk.paymentStatus,
        slotStart: bk.slotStart,
        slotEnd: bk.slotEnd,
        holdExpiresAt: bk.holdExpiresAt,
        amountCents: bk.amountCents,
        currency: bk.currency,
        resourceName: row.resourceName,
        serviceName: row.serviceName ?? null,
        orgName: row.orgName,
        orgSlug: row.orgSlug,
        timezone: row.timezone,
        meetingUrl: bk.meetingUrl,
      };
    }),

  get: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({
        booking: schema.booking,
        resourceName: schema.resource.name,
        serviceName: schema.service.name,
        locationName: schema.location.name,
        timezone: schema.location.timezone,
      })
      .from(schema.booking)
      .innerJoin(schema.resource, eq(schema.resource.id, schema.booking.resourceId))
      .innerJoin(schema.location, eq(schema.location.id, schema.booking.locationId))
      .leftJoin(schema.service, eq(schema.service.id, schema.booking.serviceId))
      .where(
        and(eq(schema.booking.id, input.id), eq(schema.booking.organizationId, ctx.organizationId)),
      );
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
    return {
      ...row.booking,
      resourceName: row.resourceName,
      serviceName: row.serviceName ?? null,
      locationName: row.locationName,
      timezone: row.timezone,
    };
  }),

  // "Today" is a calendar day in the location's timezone, not the server's.
  listToday: tenantProcedure
    .input(z.object({ date: dateStr.optional(), locationId: z.string().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const locations = await ctx.db
        .select({ id: schema.location.id, timezone: schema.location.timezone })
        .from(schema.location)
        .where(
          and(
            eq(schema.location.organizationId, ctx.organizationId),
            isNull(schema.location.archivedAt),
          ),
        )
        .orderBy(asc(schema.location.createdAt));
      const location = input.locationId
        ? locations.find((l) => l.id === input.locationId)
        : locations[0];
      if (input.locationId && !location) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found.' });
      }
      const timezone = location?.timezone ?? 'UTC';
      const date = input.date ?? todayInTz(timezone);
      const window = dayWindowUtc(date, timezone);

      await expireStaleHolds(ctx.db);
      const conditions = [
        eq(schema.booking.organizationId, ctx.organizationId),
        gte(schema.booking.slotStart, window.start),
        lt(schema.booking.slotStart, window.end),
        notInArray(schema.booking.status, ['cancelled', 'expired']),
      ];
      if (input.locationId) conditions.push(eq(schema.booking.locationId, input.locationId));
      const bookings = await ctx.db
        .select()
        .from(schema.booking)
        .where(and(...conditions))
        .orderBy(asc(schema.booking.slotStart));
      return { timezone, date, bookings };
    }),

  list: tenantProcedure
    .input(
      z
        .object({
          from: z.iso.datetime().optional(),
          to: z.iso.datetime().optional(),
          resourceId: z.string().optional(),
          status: bookingStatus.optional(),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        })
        .default({ limit: 50, offset: 0 }),
    )
    .query(async ({ ctx, input }) => {
      await expireStaleHolds(ctx.db);
      const conditions = [eq(schema.booking.organizationId, ctx.organizationId)];
      if (input.from) conditions.push(gte(schema.booking.slotStart, new Date(input.from)));
      if (input.to) conditions.push(lt(schema.booking.slotStart, new Date(input.to)));
      if (input.resourceId) conditions.push(eq(schema.booking.resourceId, input.resourceId));
      if (input.status) conditions.push(eq(schema.booking.status, input.status));

      // Each row carries its location's timezone so clients render times
      // where the appointment happens, not where the viewer is.
      const rows = await ctx.db
        .select({ booking: schema.booking, timezone: schema.location.timezone })
        .from(schema.booking)
        .innerJoin(schema.location, eq(schema.location.id, schema.booking.locationId))
        .where(and(...conditions))
        .orderBy(desc(schema.booking.slotStart), desc(schema.booking.id))
        .limit(input.limit)
        .offset(input.offset);
      return rows.map((r) => ({ ...r.booking, timezone: r.timezone }));
    }),

  cancel: tenantProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().max(500).optional(),
        refund: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.refund && ctx.role !== 'owner' && ctx.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only owners and admins can refund.' });
      }
      const booking = await loadOwned(ctx, input.id);
      assertTransition(booking.status, 'cancelled');

      await transition(ctx.db, booking, 'cancelled', { cancelReason: input.reason ?? null });
      await notifyCancelled(ctx.db, booking.id);

      // Refund after cancelling: a gateway failure must not leave the slot
      // booked, and the refund can be retried from payment.refund.
      let refundError: string | null = null;
      if (input.refund) {
        try {
          await refundBooking(ctx.db, booking);
        } catch (err) {
          refundError = err instanceof Error ? err.message : 'Refund failed.';
        }
      }
      return {
        ok: true as const,
        status: 'cancelled' as const,
        refunded: input.refund && !refundError,
        refundError,
      };
    }),

  markNoShow: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await loadOwned(ctx, input.id);
      assertTransition(booking.status, 'no_show');
      await transition(ctx.db, booking, 'no_show');
      return { ok: true as const, status: 'no_show' as const };
    }),

  markComplete: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await loadOwned(ctx, input.id);
      assertTransition(booking.status, 'completed');
      await transition(ctx.db, booking, 'completed');
      return { ok: true as const, status: 'completed' as const };
    }),

  // Free slots on a date for every resource (or one), as the booking page
  // would offer them. Staff can still book any other time with createByStaff.
  openSlots: tenantProcedure
    .input(
      z.object({
        date: dateStr,
        resourceId: z.string().optional(),
        serviceId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const resources = await ctx.db
        .select({ id: schema.resource.id })
        .from(schema.resource)
        .where(
          and(
            eq(schema.resource.organizationId, ctx.organizationId),
            isNull(schema.resource.archivedAt),
            input.resourceId ? eq(schema.resource.id, input.resourceId) : undefined,
          ),
        )
        .orderBy(asc(schema.resource.createdAt));
      const now = new Date();
      const results = [];
      for (const r of resources) {
        const resolved = await resolveBookable(ctx.db, {
          orgId: ctx.organizationId,
          resourceId: r.id,
          serviceId: input.serviceId,
        });
        // Archived location, or the resource doesn't offer this service.
        if (!resolved.ok) continue;
        const b = resolved.value;
        const taken = await takenIntervals(ctx.db, b, dayWindowUtc(input.date, b.timezone));
        results.push({
          resourceId: b.resourceId,
          resourceName: b.resourceName,
          locationId: b.locationId,
          timezone: b.timezone,
          durationMin: b.slotMin,
          slots: await candidateSlots(ctx.db, b, input.date, now, taken),
        });
      }
      return { date: input.date, resources: results };
    }),

  // Walk-ins and phone bookings. Unlike the public flow, staff may pick any
  // time (off the slot grid, outside hours) as long as nothing overlaps.
  // Payment, if any, is collected at the venue.
  createByStaff: tenantProcedure
    .input(
      z.object({
        resourceId: z.string(),
        serviceId: z.string().optional(),
        date: dateStr,
        time: hhmm,
        durationMin: z.number().int().min(5).max(720).optional(),
        customerName: z.string().trim().min(2).max(120),
        customerEmail: z.email().optional(),
        customerPhone: z.string().trim().max(32).optional(),
        notifyCustomer: z.boolean().default(true),
        source: z.string().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resolved = await resolveBookable(ctx.db, {
        orgId: ctx.organizationId,
        resourceId: input.resourceId,
        serviceId: input.serviceId,
      });
      if (!resolved.ok) throw new TRPCError({ code: resolved.code, message: resolved.message });
      const b = resolved.value;
      const slotStart = wallTimeToUtc(input.date, hhmmToMinutes(input.time), b.timezone);
      const slotEnd = new Date(slotStart.getTime() + (input.durationMin ?? b.slotMin) * 60_000);
      assertStaffWindow(slotStart);
      const taken = await takenIntervals(ctx.db, b, { start: slotStart, end: slotEnd });
      if (taken.some((t) => overlaps(t, { start: slotStart, end: slotEnd }))) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `${b.resourceName} is busy or off at that time.`,
        });
      }
      const { id, meetingUrl } = await insertBooking(ctx.db, b, {
        slotStart,
        slotEnd,
        customerName: input.customerName,
        customerEmail: input.customerEmail || undefined,
        customerPhone: input.customerPhone || undefined,
        status: 'confirmed',
        holdExpiresAt: null,
        source: sanitizeSource(input.source ?? 'staff'),
      });
      if (input.notifyCustomer) await notifyConfirmed(ctx.db, id);
      return {
        id,
        referenceCode: referenceCodeFor(id),
        slotStart,
        slotEnd,
        timezone: b.timezone,
        resourceName: b.resourceName,
        meetingUrl,
      };
    }),

  // Staff reschedule: any free time (same rules as createByStaff), keeping
  // the booking's length and price.
  reschedule: tenantProcedure
    .input(
      z.object({
        id: z.string(),
        date: dateStr,
        time: hhmm,
        notifyCustomer: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const booking = await loadOwned(ctx, input.id);
      if (booking.status !== 'confirmed') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Only confirmed bookings can be moved.',
        });
      }
      const [loc] = await ctx.db
        .select({ timezone: schema.location.timezone })
        .from(schema.location)
        .where(eq(schema.location.id, booking.locationId));
      const timezone = loc?.timezone ?? 'UTC';
      const start = wallTimeToUtc(input.date, hhmmToMinutes(input.time), timezone);
      const end = new Date(
        start.getTime() + (booking.slotEnd.getTime() - booking.slotStart.getTime()),
      );
      assertStaffWindow(start);
      const taken = await takenIntervals(ctx.db, booking, { start, end }, booking.id);
      if (taken.some((t) => overlaps(t, { start, end }))) {
        throw new TRPCError({ code: 'CONFLICT', message: 'That time is busy or blocked.' });
      }
      await moveBooking(ctx.db, booking, start, end);
      if (input.notifyCustomer) await notifyConfirmed(ctx.db, booking.id);
      return { ok: true as const, slotStart: start, slotEnd: end, timezone };
    }),
});

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending_payment: ['cancelled'],
  confirmed: ['cancelled', 'completed', 'no_show'],
  cancelled: [],
  completed: [],
  no_show: [],
  expired: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function assertTransition(from: BookingStatus, to: BookingStatus) {
  if (!canTransition(from, to)) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `A ${from.replace('_', ' ')} booking can't be marked ${to.replace('_', ' ')}.`,
    });
  }
}

async function loadOwned(ctx: { db: Db; organizationId: string }, id: string) {
  const [booking] = await ctx.db
    .select()
    .from(schema.booking)
    .where(and(eq(schema.booking.id, id), eq(schema.booking.organizationId, ctx.organizationId)));
  if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
  return booking;
}

// Compare-and-set on the status so two staff clicking at once can't both
// apply (e.g. a double cancellation sending two SMS).
async function transition(
  db: Db,
  booking: { id: string; status: BookingStatus },
  to: BookingStatus,
  extra: { cancelReason?: string | null } = {},
) {
  const updated = await db
    .update(schema.booking)
    .set({ status: to, holdExpiresAt: null, ...extra })
    .where(and(eq(schema.booking.id, booking.id), eq(schema.booking.status, booking.status)))
    .returning({ id: schema.booking.id });
  if (updated.length === 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'This booking was just updated by someone else — refresh and try again.',
    });
  }
}
