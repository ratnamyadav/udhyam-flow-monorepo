import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { atomic, type Db, schema } from '@udyamflow/db';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { currency } from '../lib/validate';
import { publicProcedure, router, tenantAdminProcedure, tenantProcedure } from '../trpc';

// Tenant-scoped service catalog + the join table that tells the booking page
// which resources offer each service. A service with no linked resources is
// offered by every resource.

async function listWithResources(db: Db, organizationId: string) {
  const services = await db
    .select()
    .from(schema.service)
    .where(
      and(eq(schema.service.organizationId, organizationId), isNull(schema.service.archivedAt)),
    )
    .orderBy(asc(schema.service.createdAt));
  if (services.length === 0) return [];
  const links = await db
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
}

// Rejects resource ids from other tenants (or archived ones) before they're
// linked — the public booking page trusts these links.
async function assertOwnedResources(db: Db, organizationId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return unique;
  const owned = await db
    .select({ id: schema.resource.id })
    .from(schema.resource)
    .where(
      and(
        inArray(schema.resource.id, unique),
        eq(schema.resource.organizationId, organizationId),
        isNull(schema.resource.archivedAt),
      ),
    );
  if (owned.length !== unique.length) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found' });
  }
  return unique;
}

async function assertOwnedService(db: Db, organizationId: string, id: string) {
  const [owned] = await db
    .select({ id: schema.service.id })
    .from(schema.service)
    .where(
      and(
        eq(schema.service.id, id),
        eq(schema.service.organizationId, organizationId),
        isNull(schema.service.archivedAt),
      ),
    );
  if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
}

export const serviceRouter = router({
  list: tenantProcedure.query(({ ctx }) => listWithResources(ctx.db, ctx.organizationId)),

  create: tenantAdminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        description: z.string().max(1000).optional(),
        durationMin: z.number().int().min(5).max(480),
        priceCents: z.number().int().min(0).default(0),
        currency: currency.default('INR'),
        resourceIds: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resourceIds = await assertOwnedResources(ctx.db, ctx.organizationId, input.resourceIds);
      const id = `svc_${randomUUID()}`;
      await atomic(ctx.db, [
        ctx.db.insert(schema.service).values({
          id,
          organizationId: ctx.organizationId,
          name: input.name,
          description: input.description,
          durationMin: input.durationMin,
          priceCents: input.priceCents,
          currency: input.currency,
        }),
        ...(resourceIds.length > 0
          ? [
              ctx.db
                .insert(schema.serviceResource)
                .values(resourceIds.map((rid) => ({ serviceId: id, resourceId: rid }))),
            ]
          : []),
      ]);
      return { id };
    }),

  update: tenantAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(2).max(120).optional(),
        description: z.string().max(1000).nullable().optional(),
        durationMin: z.number().int().min(5).max(480).optional(),
        priceCents: z.number().int().min(0).optional(),
        currency: currency.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedService(ctx.db, ctx.organizationId, input.id);
      const { id, ...patch } = input;
      await ctx.db.update(schema.service).set(patch).where(eq(schema.service.id, id));
      return { ok: true };
    }),

  // Archived, not deleted — past bookings still resolve the service name.
  remove: tenantAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedService(ctx.db, ctx.organizationId, input.id);
      await ctx.db
        .update(schema.service)
        .set({ archivedAt: new Date() })
        .where(eq(schema.service.id, input.id));
      return { ok: true };
    }),

  setResources: tenantAdminProcedure
    .input(z.object({ serviceId: z.string(), resourceIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedService(ctx.db, ctx.organizationId, input.serviceId);
      const resourceIds = await assertOwnedResources(ctx.db, ctx.organizationId, input.resourceIds);
      await atomic(ctx.db, [
        ctx.db
          .delete(schema.serviceResource)
          .where(eq(schema.serviceResource.serviceId, input.serviceId)),
        ...(resourceIds.length > 0
          ? [
              ctx.db
                .insert(schema.serviceResource)
                .values(
                  resourceIds.map((rid) => ({ serviceId: input.serviceId, resourceId: rid })),
                ),
            ]
          : []),
      ]);
      return { ok: true };
    }),

  // Public read for the booking page — services offered by an org, each with
  // the resources that perform it (empty = all of them).
  listForTenant: publicProcedure
    .input(z.object({ orgSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!org) return [];
      const services = await listWithResources(ctx.db, org.id);
      return services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        priceCents: s.priceCents,
        currency: s.currency,
        resourceIds: s.resourceIds,
      }));
    }),
});
