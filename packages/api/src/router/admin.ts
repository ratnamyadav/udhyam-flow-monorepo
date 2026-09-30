import { schema } from '@udyamflow/db';
import { and, count, desc, eq, gte, ilike, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { platformAdminProcedure, router } from '../trpc';

// Internal staff panel (apps/admin). Read-only platform overview; every
// procedure requires `user.role === 'admin'`.

const page = z
  .object({
    query: z.string().trim().max(100).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .default({ limit: 50, offset: 0 });

function countBy<T extends string>(rows: Array<{ key: T; n: number }>): Map<T, number> {
  return new Map(rows.map((r) => [r.key, Number(r.n)]));
}

export const adminRouter = router({
  overview: platformAdminProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [[orgs], [users], [bookings], [paid]] = await Promise.all([
      ctx.db.select({ n: count() }).from(schema.organization),
      ctx.db.select({ n: count() }).from(schema.user),
      ctx.db
        .select({ n: count() })
        .from(schema.booking)
        .where(gte(schema.booking.createdAt, since)),
      ctx.db
        .select({ n: count() })
        .from(schema.booking)
        .where(
          and(
            gte(schema.booking.createdAt, since),
            inArray(schema.booking.paymentStatus, ['paid', 'partially_refunded', 'refunded']),
          ),
        ),
    ]);
    return {
      organizations: Number(orgs?.n ?? 0),
      users: Number(users?.n ?? 0),
      bookings30d: Number(bookings?.n ?? 0),
      paidBookings30d: Number(paid?.n ?? 0),
    };
  }),

  listOrganizations: platformAdminProcedure.input(page).query(async ({ ctx, input }) => {
    const like = input.query ? `%${input.query}%` : null;
    const orgs = await ctx.db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
        createdAt: schema.organization.createdAt,
        profession: schema.tenantSettings.profession,
      })
      .from(schema.organization)
      .leftJoin(
        schema.tenantSettings,
        eq(schema.tenantSettings.organizationId, schema.organization.id),
      )
      .where(
        like
          ? or(ilike(schema.organization.name, like), ilike(schema.organization.slug, like))
          : undefined,
      )
      .orderBy(desc(schema.organization.createdAt))
      .limit(input.limit)
      .offset(input.offset);
    if (orgs.length === 0) return [];

    const ids = orgs.map((o) => o.id);
    const [members, locations, bookings] = await Promise.all([
      ctx.db
        .select({ key: schema.member.organizationId, n: count() })
        .from(schema.member)
        .where(inArray(schema.member.organizationId, ids))
        .groupBy(schema.member.organizationId),
      ctx.db
        .select({ key: schema.location.organizationId, n: count() })
        .from(schema.location)
        .where(
          and(inArray(schema.location.organizationId, ids), isNull(schema.location.archivedAt)),
        )
        .groupBy(schema.location.organizationId),
      ctx.db
        .select({ key: schema.booking.organizationId, n: count() })
        .from(schema.booking)
        .where(inArray(schema.booking.organizationId, ids))
        .groupBy(schema.booking.organizationId),
    ]);
    const m = countBy(members);
    const l = countBy(locations);
    const b = countBy(bookings);
    return orgs.map((o) => ({
      ...o,
      profession: o.profession ?? null,
      memberCount: m.get(o.id) ?? 0,
      locationCount: l.get(o.id) ?? 0,
      bookingCount: b.get(o.id) ?? 0,
    }));
  }),

  listUsers: platformAdminProcedure.input(page).query(({ ctx, input }) => {
    const like = input.query ? `%${input.query}%` : null;
    return ctx.db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.user.role,
        emailVerified: schema.user.emailVerified,
        createdAt: schema.user.createdAt,
      })
      .from(schema.user)
      .where(like ? or(ilike(schema.user.name, like), ilike(schema.user.email, like)) : undefined)
      .orderBy(desc(schema.user.createdAt))
      .limit(input.limit)
      .offset(input.offset);
  }),
});
