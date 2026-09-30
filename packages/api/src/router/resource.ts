import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { atomic, type Db, SLOT_BLOCKING_STATUSES, schema } from '@udyamflow/db';
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { publicProcedure, router, tenantAdminProcedure, tenantProcedure } from '../trpc';

// Tenant-scoped CRUD + a public read for the booking page. All write paths
// verify every referenced id belongs to the active org before mutating.

async function assertOwnedResource(db: Db, organizationId: string, id: string) {
  const [owned] = await db
    .select({ id: schema.resource.id })
    .from(schema.resource)
    .where(
      and(
        eq(schema.resource.id, id),
        eq(schema.resource.organizationId, organizationId),
        isNull(schema.resource.archivedAt),
      ),
    );
  if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found' });
}

async function assertOwnedLocation(db: Db, organizationId: string, id: string) {
  const [loc] = await db
    .select({ id: schema.location.id })
    .from(schema.location)
    .where(
      and(
        eq(schema.location.id, id),
        eq(schema.location.organizationId, organizationId),
        isNull(schema.location.archivedAt),
      ),
    );
  if (!loc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found' });
}

// "Dr. Anjali Patel" → "AP" (not "DR"): skip honorifics, take the first and
// last remaining words (a single word gives its first two letters).
const HONORIFICS = new Set([
  'dr',
  'mr',
  'mrs',
  'ms',
  'miss',
  'prof',
  'coach',
  'sir',
  'smt',
  'shri',
]);
export function initialsFor(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w.replace(/\.$/, '').toLowerCase()));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
}

const hoursRow = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    openMin: z.number().int().min(0).max(1440),
    closeMin: z.number().int().min(0).max(1440),
  })
  .refine((h) => h.closeMin > h.openMin, 'Closing time must be after opening time');

export const resourceRouter = router({
  list: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(schema.resource)
      .where(
        and(
          eq(schema.resource.organizationId, ctx.organizationId),
          isNull(schema.resource.archivedAt),
        ),
      )
      .orderBy(asc(schema.resource.createdAt)),
  ),

  create: tenantAdminProcedure
    .input(
      z.object({
        locationId: z.string(),
        name: z.string().trim().min(2).max(120),
        title: z.string().max(120).optional(),
        avatar: z.string().max(4).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Make sure the target location is in this org — otherwise the FK would
      // succeed but cross-tenant data could be created.
      await assertOwnedLocation(ctx.db, ctx.organizationId, input.locationId);

      const id = `res_${randomUUID()}`;
      await atomic(ctx.db, [
        ctx.db.insert(schema.resource).values({
          id,
          organizationId: ctx.organizationId,
          locationId: input.locationId,
          name: input.name,
          title: input.title,
          avatar: input.avatar?.toUpperCase() ?? initialsFor(input.name),
        }),
        // Seed Mon–Fri 9–18 hours so the resource is immediately bookable.
        ctx.db.insert(schema.resourceHours).values(
          [1, 2, 3, 4, 5].map((day) => ({
            resourceId: id,
            dayOfWeek: day,
            openMin: 9 * 60,
            closeMin: 18 * 60,
          })),
        ),
      ]);
      return { id };
    }),

  update: tenantAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(2).max(120).optional(),
        title: z.string().max(120).optional(),
        avatar: z.string().max(4).optional(),
        locationId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedResource(ctx.db, ctx.organizationId, input.id);
      if (input.locationId) {
        await assertOwnedLocation(ctx.db, ctx.organizationId, input.locationId);
      }
      const { id, ...patch } = input;
      if (patch.avatar) patch.avatar = patch.avatar.toUpperCase();
      await ctx.db.update(schema.resource).set(patch).where(eq(schema.resource.id, id));
      return { ok: true };
    }),

  // Archives rather than deletes: past bookings (and the revenue and
  // utilization reports built on them) keep pointing at the resource.
  remove: tenantAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedResource(ctx.db, ctx.organizationId, input.id);

      const future = await ctx.db
        .select({ id: schema.booking.id })
        .from(schema.booking)
        .where(
          and(
            eq(schema.booking.resourceId, input.id),
            gte(schema.booking.slotStart, new Date()),
            inArray(schema.booking.status, [...SLOT_BLOCKING_STATUSES]),
          ),
        )
        .limit(1);
      if (future.length > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cancel future bookings before removing this resource.',
        });
      }

      await ctx.db
        .update(schema.resource)
        .set({ archivedAt: new Date() })
        .where(eq(schema.resource.id, input.id));
      return { ok: true };
    }),

  setHours: tenantAdminProcedure
    .input(
      z.object({
        resourceId: z.string(),
        hours: z
          .array(hoursRow)
          .refine(
            (rows) => new Set(rows.map((h) => h.dayOfWeek)).size === rows.length,
            'Each day can only appear once',
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedResource(ctx.db, ctx.organizationId, input.resourceId);

      // Replace the full weekly schedule atomically — a failed insert must
      // not leave the resource with no hours (and so unbookable).
      const ops = [
        ctx.db
          .delete(schema.resourceHours)
          .where(eq(schema.resourceHours.resourceId, input.resourceId)),
        ...(input.hours.length > 0
          ? [
              ctx.db.insert(schema.resourceHours).values(
                input.hours.map((h) => ({
                  resourceId: input.resourceId,
                  dayOfWeek: h.dayOfWeek,
                  openMin: h.openMin,
                  closeMin: h.closeMin,
                })),
              ),
            ]
          : []),
      ];
      await atomic(ctx.db, ops);
      return { ok: true };
    }),

  listHours: tenantProcedure
    .input(z.object({ resourceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertOwnedResource(ctx.db, ctx.organizationId, input.resourceId);
      return ctx.db
        .select()
        .from(schema.resourceHours)
        .where(eq(schema.resourceHours.resourceId, input.resourceId))
        .orderBy(asc(schema.resourceHours.dayOfWeek));
    }),

  // Public — used by the booking page to resolve resources by org slug.
  listForTenant: publicProcedure
    .input(z.object({ orgSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!org) return [];
      return ctx.db
        .select({
          id: schema.resource.id,
          locationId: schema.resource.locationId,
          name: schema.resource.name,
          title: schema.resource.title,
          avatar: schema.resource.avatar,
        })
        .from(schema.resource)
        .where(and(eq(schema.resource.organizationId, org.id), isNull(schema.resource.archivedAt)))
        .orderBy(asc(schema.resource.createdAt));
    }),
});
