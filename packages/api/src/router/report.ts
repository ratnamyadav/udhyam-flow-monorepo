import { type Db, schema } from '@udyamflow/db';
import { and, asc, eq, gte, inArray, isNull, lt, notInArray, or } from 'drizzle-orm';
import {
  addDaysToDate,
  startOfMonthDate,
  startOfWeekDate,
  todayInTz,
  wallTimeToUtc,
} from '../lib/time';
import { router, tenantProcedure } from '../trpc';

// Dashboard report queries. These run on the request path so they need to
// be cheap — each is a couple of scans on the (organization_id, slot_start)
// index, and the dashboard hits them in parallel.
//
// Week/month boundaries are calendar dates in the tenant's timezone (its
// first location's), not the server's.

async function tenantTimezone(db: Db, organizationId: string): Promise<string> {
  const [loc] = await db
    .select({ timezone: schema.location.timezone })
    .from(schema.location)
    .where(
      and(eq(schema.location.organizationId, organizationId), isNull(schema.location.archivedAt)),
    )
    .orderBy(asc(schema.location.createdAt))
    .limit(1);
  return loc?.timezone ?? 'UTC';
}

const NOT_HAPPENING = ['cancelled', 'expired'] as const;

export const reportRouter = router({
  // This week vs. last week — used for the trend pill on the dashboard.
  weekly: tenantProcedure.query(async ({ ctx }) => {
    const tz = await tenantTimezone(ctx.db, ctx.organizationId);
    const weekStartDate = startOfWeekDate(todayInTz(tz));
    const weekStart = wallTimeToUtc(weekStartDate, 0, tz);
    const nextWeekStart = wallTimeToUtc(addDaysToDate(weekStartDate, 7), 0, tz);
    const lastWeekStart = wallTimeToUtc(addDaysToDate(weekStartDate, -7), 0, tz);

    const rows = await ctx.db
      .select({ slotStart: schema.booking.slotStart })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, ctx.organizationId),
          notInArray(schema.booking.status, [...NOT_HAPPENING]),
          gte(schema.booking.slotStart, lastWeekStart),
          lt(schema.booking.slotStart, nextWeekStart),
        ),
      );
    const thisWeek = rows.filter((r) => r.slotStart >= weekStart).length;
    return { thisWeek, lastWeek: rows.length - thisWeek };
  }),

  // Revenue month-to-date, grouped by currency: what customers actually
  // paid (the price snapshot on the booking) minus refunds, bucketed by when
  // the payment landed.
  revenueMtd: tenantProcedure.query(async ({ ctx }) => {
    const tz = await tenantTimezone(ctx.db, ctx.organizationId);
    const monthStart = wallTimeToUtc(startOfMonthDate(todayInTz(tz)), 0, tz);

    const paid = await ctx.db
      .select({
        amountCents: schema.booking.amountCents,
        refundedCents: schema.booking.refundedCents,
        currency: schema.booking.currency,
        serviceId: schema.booking.serviceId,
      })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, ctx.organizationId),
          inArray(schema.booking.paymentStatus, ['paid', 'partially_refunded', 'refunded']),
          or(
            gte(schema.booking.paidAt, monthStart),
            // Bookings paid before paid_at existed.
            and(isNull(schema.booking.paidAt), gte(schema.booking.slotStart, monthStart)),
          ),
        ),
      );

    // Legacy rows have no price snapshot — fall back to the service price.
    const legacyServiceIds = [
      ...new Set(paid.filter((p) => p.amountCents == null && p.serviceId).map((p) => p.serviceId!)),
    ];
    const services =
      legacyServiceIds.length > 0
        ? await ctx.db
            .select({
              id: schema.service.id,
              priceCents: schema.service.priceCents,
              currency: schema.service.currency,
            })
            .from(schema.service)
            .where(inArray(schema.service.id, legacyServiceIds))
        : [];
    const byId = new Map(services.map((s) => [s.id, s]));

    const totals = new Map<string, number>();
    for (const row of paid) {
      const legacy = row.serviceId ? byId.get(row.serviceId) : undefined;
      const amount = row.amountCents ?? legacy?.priceCents;
      const currency = row.currency ?? legacy?.currency;
      if (amount == null || !currency) continue;
      totals.set(currency, (totals.get(currency) ?? 0) + amount - row.refundedCents);
    }
    return Array.from(totals.entries()).map(([currency, cents]) => ({ currency, cents }));
  }),

  // Utilization over the past 7 days: % of resource-hour slots that were
  // booked. Approximates working hours from resource_hours.
  utilization7d: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const resources = await ctx.db
      .select({ id: schema.resource.id })
      .from(schema.resource)
      .where(
        and(
          eq(schema.resource.organizationId, ctx.organizationId),
          isNull(schema.resource.archivedAt),
        ),
      );
    if (resources.length === 0) return { booked: 0, available: 0 };

    const hours = await ctx.db
      .select()
      .from(schema.resourceHours)
      .where(
        inArray(
          schema.resourceHours.resourceId,
          resources.map((r) => r.id),
        ),
      );
    // Available minutes = sum of (close - open) across each resource's week.
    const availableMin = hours.reduce((sum, h) => sum + (h.closeMin - h.openMin), 0);

    const booked = await ctx.db
      .select({ start: schema.booking.slotStart, end: schema.booking.slotEnd })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, ctx.organizationId),
          notInArray(schema.booking.status, [...NOT_HAPPENING]),
          gte(schema.booking.slotStart, weekAgo),
          lt(schema.booking.slotStart, now),
        ),
      );
    const bookedMin = booked.reduce(
      (sum, b) => sum + Math.max(0, (b.end.getTime() - b.start.getTime()) / 60_000),
      0,
    );
    return { booked: bookedMin, available: availableMin };
  }),
});
