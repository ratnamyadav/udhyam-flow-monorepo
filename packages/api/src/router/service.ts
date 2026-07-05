import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { publicProcedure, router, tenantProcedure } from '../trpc';

// Tenant-scoped service catalog + the join table that tells the booking page
// which resources offer each service.

export const serviceRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const services = await ctx.db
      .select()
      .from(schema.service)
      .where(eq(schema.service.organizationId, ctx.organizationId));
    if (services.length === 0) return [];
    const links = await ctx.db
      .select()
      .from(schema.serviceResource)
      .where(
        inArray(
          schema.serviceResource.serviceId,
          services.map((s) => s.id),
        ),
      );
    return services.map((s) => ({
      ...s,
      resourceIds: links.filter((l) => l.serviceId === s.id).map((l) => l.resourceId),
    }));
  }),

  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(2),
        description: z.string().optional(),
        durationMin: z.number().int().min(5).max(480),
        priceCents: z.number().int().min(0).default(0),
        currency: z.string().length(3).default('INR'),
        resourceIds: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = `svc_${randomUUID()}`;
      await ctx.db.insert(schema.service).values({
        id,
        organizationId: ctx.organizationId,
        name: input.name,
        description: input.description,
        durationMin: input.durationMin,
        priceCents: input.priceCents,
        currency: input.currency,
      });
      if (input.resourceIds.length > 0) {
        await ctx.db
          .insert(schema.serviceResource)
          .values(input.resourceIds.map((rid) => ({ serviceId: id, resourceId: rid })))
          .onConflictDoNothing();
      }
      return { id };
    }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        description: z.string().optional(),
        durationMin: z.number().int().min(5).max(480).optional(),
        priceCents: z.number().int().min(0).optional(),
        currency: z.string().length(3).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [owned] = await ctx.db
        .select({ id: schema.service.id })
        .from(schema.service)
        .where(
          and(
            eq(schema.service.id, input.id),
            eq(schema.service.organizationId, ctx.organizationId),
          ),
        );
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
      const { id, ...patch } = input;
      await ctx.db.update(schema.service).set(patch).where(eq(schema.service.id, id));
      return { ok: true };
    }),

  remove: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const [owned] = await ctx.db
      .select({ id: schema.service.id })
      .from(schema.service)
      .where(
        and(eq(schema.service.id, input.id), eq(schema.service.organizationId, ctx.organizationId)),
      );
    if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
    await ctx.db.delete(schema.service).where(eq(schema.service.id, input.id));
    return { ok: true };
  }),

  setResources: tenantProcedure
    .input(z.object({ serviceId: z.string(), resourceIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await ctx.db
        .select({ id: schema.service.id })
        .from(schema.service)
        .where(
          and(
            eq(schema.service.id, input.serviceId),
            eq(schema.service.organizationId, ctx.organizationId),
          ),
        );
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      await ctx.db
        .delete(schema.serviceResource)
        .where(eq(schema.serviceResource.serviceId, input.serviceId));
      if (input.resourceIds.length > 0) {
        await ctx.db
          .insert(schema.serviceResource)
          .values(
            input.resourceIds.map((rid) => ({ serviceId: input.serviceId, resourceId: rid })),
          );
      }
      return { ok: true };
    }),

  // Public read for the booking page — services offered by an org, filtered
  // by which resources can perform them.
  listForTenant: publicProcedure
    .input(z.object({ orgSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!org) return [];
      const services = await ctx.db
        .select()
        .from(schema.service)
        .where(eq(schema.service.organizationId, org.id));
      if (services.length === 0) return [];
      const links = await ctx.db
        .select()
        .from(schema.serviceResource)
        .where(
          inArray(
            schema.serviceResource.serviceId,
            services.map((s) => s.id),
          ),
        );
      return services.map((s) => ({
        ...s,
        resourceIds: links.filter((l) => l.serviceId === s.id).map((l) => l.resourceId),
      }));
    }),
});
