import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, schema } from '@udyamflow/db';
import { and, asc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Interval } from '../lib/slots';
import { addDaysToDate, hhmmToMinutes, wallTimeToUtc } from '../lib/time';
import { dateStr, hhmm } from '../lib/validate';
import { router, tenantProcedure } from '../trpc';

// Blocked time (holidays, leave, breaks). Any team member can block time —
// it's no more powerful than the bookings they can already create — and it
// only hides slots; existing bookings in the window are returned so the
// caller can move or cancel them.

const MAX_SPAN_MS = 366 * 24 * 60 * 60 * 1000;

// Time off that blocks `resourceId` (its own rows plus location-wide rows)
// overlapping `window`.
export async function timeOffIntervals(
  db: Db,
  b: { locationId: string; resourceId: string },
  window: Interval,
): Promise<Interval[]> {
  return db
    .select({ start: schema.timeOff.startsAt, end: schema.timeOff.endsAt })
    .from(schema.timeOff)
    .where(
      and(
        eq(schema.timeOff.locationId, b.locationId),
        or(isNull(schema.timeOff.resourceId), eq(schema.timeOff.resourceId, b.resourceId)),
        lt(schema.timeOff.startsAt, window.end),
        gt(schema.timeOff.endsAt, window.start),
      ),
    );
}

// Resolves where the time off applies: a resource (and its location), a
// location (everyone there), or — when the business has a single location —
// nothing at all, meaning "the whole business".
async function resolveScope(
  db: Db,
  organizationId: string,
  input: { locationId?: string; resourceId?: string },
) {
  if (input.resourceId) {
    const [r] = await db
      .select({ locationId: schema.resource.locationId, timezone: schema.location.timezone })
      .from(schema.resource)
      .innerJoin(schema.location, eq(schema.location.id, schema.resource.locationId))
      .where(
        and(
          eq(schema.resource.id, input.resourceId),
          eq(schema.resource.organizationId, organizationId),
          isNull(schema.resource.archivedAt),
        ),
      );
    if (!r) throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (input.locationId && input.locationId !== r.locationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'That resource is not at that location.',
      });
    }
    return { locationId: r.locationId, resourceId: input.resourceId, timezone: r.timezone };
  }
  const locations = await db
    .select({ id: schema.location.id, timezone: schema.location.timezone })
    .from(schema.location)
    .where(
      and(eq(schema.location.organizationId, organizationId), isNull(schema.location.archivedAt)),
    );
  const loc = input.locationId
    ? locations.find((l) => l.id === input.locationId)
    : locations.length === 1
      ? locations[0]
      : undefined;
  if (!loc) {
    throw new TRPCError({
      code: input.locationId ? 'NOT_FOUND' : 'BAD_REQUEST',
      message: input.locationId ? 'Location not found.' : 'Pick a location or a resource.',
    });
  }
  return { locationId: loc.id, resourceId: null, timezone: loc.timezone };
}

export const timeOffRouter = router({
  // Current and upcoming blocked time.
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        timeOff: schema.timeOff,
        locationName: schema.location.name,
        timezone: schema.location.timezone,
        resourceName: schema.resource.name,
      })
      .from(schema.timeOff)
      .innerJoin(schema.location, eq(schema.location.id, schema.timeOff.locationId))
      .leftJoin(schema.resource, eq(schema.resource.id, schema.timeOff.resourceId))
      .where(
        and(
          eq(schema.timeOff.organizationId, ctx.organizationId),
          gt(schema.timeOff.endsAt, new Date()),
        ),
      )
      .orderBy(asc(schema.timeOff.startsAt))
      .limit(200);
    return rows.map((r) => ({
      ...r.timeOff,
      locationName: r.locationName,
      resourceName: r.resourceName ?? null,
      timezone: r.timezone,
    }));
  }),

  // Dates/times are wall-clock in the location's timezone. Without times the
  // block covers whole days, `startDate` through `endDate` inclusive.
  add: tenantProcedure
    .input(
      z.object({
        locationId: z.string().optional(),
        resourceId: z.string().optional(),
        startDate: dateStr,
        endDate: dateStr.optional(),
        startTime: hhmm.optional(),
        endTime: hhmm.optional(),
        reason: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.db, ctx.organizationId, input);
      const endDate = input.endDate ?? input.startDate;
      const startsAt = wallTimeToUtc(
        input.startDate,
        input.startTime ? hhmmToMinutes(input.startTime) : 0,
        scope.timezone,
      );
      const endsAt = input.endTime
        ? wallTimeToUtc(endDate, hhmmToMinutes(input.endTime), scope.timezone)
        : wallTimeToUtc(addDaysToDate(endDate, 1), 0, scope.timezone);
      if (endsAt <= startsAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The end must be after the start.' });
      }
      if (endsAt.getTime() - startsAt.getTime() > MAX_SPAN_MS) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Block at most a year at a time.' });
      }

      const id = `off_${randomUUID()}`;
      await ctx.db.insert(schema.timeOff).values({
        id,
        organizationId: ctx.organizationId,
        locationId: scope.locationId,
        resourceId: scope.resourceId,
        startsAt,
        endsAt,
        reason: input.reason || null,
      });

      // Bookings already inside the window stay put — surface them.
      const conflicts = await ctx.db
        .select({
          id: schema.booking.id,
          customerName: schema.booking.customerName,
          slotStart: schema.booking.slotStart,
          resourceName: schema.resource.name,
        })
        .from(schema.booking)
        .innerJoin(schema.resource, eq(schema.resource.id, schema.booking.resourceId))
        .where(
          and(
            eq(schema.booking.locationId, scope.locationId),
            scope.resourceId ? eq(schema.booking.resourceId, scope.resourceId) : undefined,
            inArray(schema.booking.status, ['confirmed', 'pending_payment']),
            lt(schema.booking.slotStart, endsAt),
            gt(schema.booking.slotEnd, startsAt),
          ),
        )
        .orderBy(asc(schema.booking.slotStart));
      return { id, startsAt, endsAt, timezone: scope.timezone, conflicts };
    }),

  remove: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const deleted = await ctx.db
      .delete(schema.timeOff)
      .where(
        and(eq(schema.timeOff.id, input.id), eq(schema.timeOff.organizationId, ctx.organizationId)),
      )
      .returning({ id: schema.timeOff.id });
    if (!deleted.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Time off not found.' });
    return { ok: true as const };
  }),
});
