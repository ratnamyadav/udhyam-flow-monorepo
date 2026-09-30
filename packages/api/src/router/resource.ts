import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { and, eq, gte, ne } from 'drizzle-orm';
import { z } from 'zod';
import { meetingUrlInput } from '../online';
import { publicProcedure, router, tenantProcedure } from '../trpc';

// Tenant-scoped CRUD + a public read for the booking page. All write paths
// verify the resource belongs to the active org before mutating.

export const resourceRouter = router({
  list: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(schema.resource)
      .where(eq(schema.resource.organizationId, ctx.organizationId)),
  ),

  create: tenantProcedure
    .input(
      z.object({
        locationId: z.string(),
        name: z.string().min(2),
        title: z.string().optional(),
        avatar: z.string().max(4).optional(),
        // Personal Meet/Zoom room for online services (https only).
        meetingUrl: meetingUrlInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Make sure the target location is in this org — otherwise the FK would
      // succeed but cross-tenant data could be created.
      const [loc] = await ctx.db
        .select({ id: schema.location.id })
        .from(schema.location)
        .where(
          and(
            eq(schema.location.id, input.locationId),
            eq(schema.location.organizationId, ctx.organizationId),
          ),
        );
      if (!loc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found' });

      const id = `res_${randomUUID()}`;
      await ctx.db.insert(schema.resource).values({
        id,
        organizationId: ctx.organizationId,
        locationId: input.locationId,
        name: input.name,
        title: input.title,
        avatar: input.avatar?.toUpperCase() ?? input.name.slice(0, 2).toUpperCase(),
        meetingUrl: input.meetingUrl ?? null,
      });

      // Seed Mon–Fri 9–18 hours so the resource is immediately bookable.
      for (let day = 1; day <= 5; day++) {
        await ctx.db
          .insert(schema.resourceHours)
          .values({ resourceId: id, dayOfWeek: day, openMin: 9 * 60, closeMin: 18 * 60 })
          .onConflictDoNothing();
      }

      return { id };
    }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        title: z.string().optional(),
        avatar: z.string().max(4).optional(),
        locationId: z.string().optional(),
        // '' or null clears it.
        meetingUrl: meetingUrlInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [owned] = await ctx.db
        .select({ id: schema.resource.id })
        .from(schema.resource)
        .where(
          and(
            eq(schema.resource.id, input.id),
            eq(schema.resource.organizationId, ctx.organizationId),
          ),
        );
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found' });

      const { id, ...patch } = input;
      await ctx.db.update(schema.resource).set(patch).where(eq(schema.resource.id, id));
      return { ok: true };
    }),

  remove: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const [owned] = await ctx.db
      .select({ id: schema.resource.id })
      .from(schema.resource)
      .where(
        and(
          eq(schema.resource.id, input.id),
          eq(schema.resource.organizationId, ctx.organizationId),
        ),
      );
    if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found' });

    // Soft-block: refuse delete if there are future, non-cancelled bookings.
    const future = await ctx.db
      .select({ id: schema.booking.id })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.resourceId, input.id),
          gte(schema.booking.slotStart, new Date()),
          ne(schema.booking.status, 'cancelled'),
        ),
      )
      .limit(1);
    if (future.length > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Cancel future bookings before removing this resource.',
      });
    }

    await ctx.db.delete(schema.resource).where(eq(schema.resource.id, input.id));
    return { ok: true };
  }),

  setHours: tenantProcedure
    .input(
      z.object({
        resourceId: z.string(),
        hours: z.array(
          z.object({
            dayOfWeek: z.number().int().min(0).max(6),
            openMin: z.number().int().min(0).max(1440),
            closeMin: z.number().int().min(0).max(1440),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [owned] = await ctx.db
        .select({ id: schema.resource.id })
        .from(schema.resource)
        .where(
          and(
            eq(schema.resource.id, input.resourceId),
            eq(schema.resource.organizationId, ctx.organizationId),
          ),
        );
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found' });

      // Replace the full weekly schedule for this resource.
      await ctx.db
        .delete(schema.resourceHours)
        .where(eq(schema.resourceHours.resourceId, input.resourceId));
      if (input.hours.length > 0) {
        await ctx.db.insert(schema.resourceHours).values(
          input.hours.map((h) => ({
            resourceId: input.resourceId,
            dayOfWeek: h.dayOfWeek,
            openMin: h.openMin,
            closeMin: h.closeMin,
          })),
        );
      }
      return { ok: true };
    }),

  listHours: tenantProcedure
    .input(z.object({ resourceId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(schema.resourceHours)
        .where(eq(schema.resourceHours.resourceId, input.resourceId)),
    ),

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
        .select()
        .from(schema.resource)
        .where(eq(schema.resource.organizationId, org.id));
    }),
});
