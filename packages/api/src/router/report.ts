import { schema } from '@udyamflow/db';
import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc';

// Dashboard report queries. These run on the request path so they need to
// be cheap — we keep them to ~2-3 indexed scans each, and the dashboard
// hits them in parallel.

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay()); // Sunday-start
  return r;
}

function startOfMonth(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(1);
  return r;
}

export const reportRouter = router({
  // This week vs. last week — used for the trend pill on the dashboard.
  weekly: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const baseConditions = [
      eq(schema.booking.organizationId, ctx.organizationId),
      ne(schema.booking.status, 'cancelled'),
    ];

    const thisWeek = await ctx.db
      .select({ id: schema.booking.id })
      .from(schema.booking)
      .where(and(...baseConditions, gte(schema.booking.slotStart, weekStart)));
    const lastWeek = await ctx.db
      .select({ id: schema.booking.id })
      .from(schema.booking)
      .where(
        and(
          ...baseConditions,
          gte(schema.booking.slotStart, lastWeekStart),
          lt(schema.booking.slotStart, weekStart),
        ),
      );
    return { thisWeek: thisWeek.length, lastWeek: lastWeek.length };
  }),

  // Revenue MTD, grouped by currency. We sum from `service.priceCents` for
  // every paid booking — the booking row itself doesn't store amount yet.
  revenueMtd: tenantProcedure.query(async ({ ctx }) => {
    const monthStart = startOfMonth(new Date());

    // First find paid bookings this month with a service.
    const paid = await ctx.db
      .select({
        serviceId: schema.booking.serviceId,
      })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, ctx.organizationId),
          eq(schema.booking.paymentStatus, 'paid'),
          gte(schema.booking.slotStart, monthStart),
        ),
      );

    const serviceIds = Array.from(
      new Set(paid.map((p) => p.serviceId).filter((x): x is string => !!x)),
    );
    if (serviceIds.length === 0) return [] as Array<{ currency: string; cents: number }>;

    const services = await ctx.db
      .select({
        id: schema.service.id,
        priceCents: schema.service.priceCents,
        currency: schema.service.currency,
      })
      .from(schema.service)
      .where(inArray(schema.service.id, serviceIds));
    const byId = new Map(services.map((s) => [s.id, s]));

    const totals = new Map<string, number>();
    for (const row of paid) {
      if (!row.serviceId) continue;
      const svc = byId.get(row.serviceId);
      if (!svc) continue;
      totals.set(svc.currency, (totals.get(svc.currency) ?? 0) + svc.priceCents);
    }
    return Array.from(totals.entries()).map(([currency, cents]) => ({ currency, cents }));
  }),

  // Utilization over the past 7 days: % of resource-hour slots that were
  // booked (non-cancelled). Approximates working hours from resource_hours.
  utilization7d: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const resources = await ctx.db
      .select({ id: schema.resource.id })
      .from(schema.resource)
      .where(eq(schema.resource.organizationId, ctx.organizationId));
    if (resources.length === 0) return { booked: 0, available: 0 };

    const resIds = resources.map((r) => r.id);
    const hours = await ctx.db
      .select()
      .from(schema.resourceHours)
      .where(inArray(schema.resourceHours.resourceId, resIds));

    // Total available minutes/week for each resource × 1 week = sum of
    // (close-open) across the week's days.
    const minutesPerResource = new Map<string, number>();
    for (const h of hours) {
      minutesPerResource.set(
        h.resourceId,
        (minutesPerResource.get(h.resourceId) ?? 0) + (h.closeMin - h.openMin),
      );
    }
    const availableMin = Array.from(minutesPerResource.values()).reduce((a, b) => a + b, 0);

    const booked = await ctx.db
      .select({ start: schema.booking.slotStart, end: schema.booking.slotEnd })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, ctx.organizationId),
          ne(schema.booking.status, 'cancelled'),
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
