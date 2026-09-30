import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { bookingUrlFor, SHARE_SOURCES } from '../source';
import { router, tenantProcedure } from '../trpc';

// Booking channels: shareable per-source booking links (Google Business
// Profile, Instagram bio, WhatsApp Business) and how many bookings each
// source brought in. Source comes from `booking.source`, set from the
// `?source=` param on the public booking page.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const DAY_MS = 24 * 60 * 60 * 1000;

export const channelsRouter = router({
  overview: tenantProcedure.query(async ({ ctx }) => {
    const [org] = await ctx.db
      .select({ slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, ctx.organizationId));
    if (!org) throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });

    const since = new Date(Date.now() - 30 * DAY_MS);
    const total = sql<number>`count(*)::int`;
    const cancelled = sql<number>`count(*) filter (where ${schema.booking.status} = 'cancelled')::int`;
    const rows = await ctx.db
      .select({ source: schema.booking.source, total, cancelled })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, ctx.organizationId),
          gte(schema.booking.createdAt, since),
        ),
      )
      .groupBy(schema.booking.source)
      .orderBy(desc(total));

    return {
      bookingUrl: bookingUrlFor(APP_URL, org.slug),
      links: SHARE_SOURCES.map((source) => ({
        source,
        url: bookingUrlFor(APP_URL, org.slug, source),
      })),
      // `null` source = direct / untagged link.
      bySource: rows.map((r) => ({
        source: r.source,
        total: Number(r.total),
        cancelled: Number(r.cancelled),
      })),
    };
  }),
});
