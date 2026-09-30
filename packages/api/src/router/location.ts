import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { atomic, SLOT_BLOCKING_STATUSES, schema } from '@udyamflow/db';
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { currency, timeZone } from '../lib/validate';
import { publicProcedure, router, tenantAdminProcedure, tenantProcedure } from '../trpc';

export const locationRouter = router({
  list: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(schema.location)
      .where(
        and(
          eq(schema.location.organizationId, ctx.organizationId),
          isNull(schema.location.archivedAt),
        ),
      )
      .orderBy(asc(schema.location.createdAt)),
  ),

  // Public — the booking page's location picker.
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
          id: schema.location.id,
          name: schema.location.name,
          address: schema.location.address,
          timezone: schema.location.timezone,
          currency: schema.location.currency,
        })
        .from(schema.location)
        .where(and(eq(schema.location.organizationId, org.id), isNull(schema.location.archivedAt)))
        .orderBy(asc(schema.location.createdAt));
    }),

  create: tenantAdminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        address: z.string().max(300).optional(),
        timezone: timeZone,
        currency,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = `loc_${randomUUID()}`;
      await ctx.db.insert(schema.location).values({
        id,
        organizationId: ctx.organizationId,
        ...input,
      });
      return { id };
    }),

  update: tenantAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(2).max(120).optional(),
        address: z.string().max(300).nullable().optional(),
        timezone: timeZone.optional(),
        currency: currency.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const updated = await ctx.db
        .update(schema.location)
        .set(patch)
        .where(
          and(
            eq(schema.location.id, id),
            eq(schema.location.organizationId, ctx.organizationId),
            isNull(schema.location.archivedAt),
          ),
        )
        .returning({ id: schema.location.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found' });
      }
      return { ok: true };
    }),

  // Archives rather than deletes so past bookings keep their location.
  remove: tenantAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const active = await ctx.db
        .select({ id: schema.location.id })
        .from(schema.location)
        .where(
          and(
            eq(schema.location.organizationId, ctx.organizationId),
            isNull(schema.location.archivedAt),
          ),
        );
      if (!active.some((l) => l.id === input.id)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found' });
      }
      if (active.length === 1) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: "You can't remove your only location.",
        });
      }
      const future = await ctx.db
        .select({ id: schema.booking.id })
        .from(schema.booking)
        .where(
          and(
            eq(schema.booking.locationId, input.id),
            gte(schema.booking.slotStart, new Date()),
            inArray(schema.booking.status, [...SLOT_BLOCKING_STATUSES]),
          ),
        )
        .limit(1);
      if (future.length > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cancel future bookings at this location before removing it.',
        });
      }
      const now = new Date();
      // The location's resources are archived with it.
      await atomic(ctx.db, [
        ctx.db
          .update(schema.location)
          .set({ archivedAt: now })
          .where(eq(schema.location.id, input.id)),
        ctx.db
          .update(schema.resource)
          .set({ archivedAt: now })
          .where(and(eq(schema.resource.locationId, input.id), isNull(schema.resource.archivedAt))),
      ]);
      return { ok: true };
    }),
});
