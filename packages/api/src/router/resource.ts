import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { publicProcedure, router, tenantProcedure } from '../trpc';

export const resourceRouter = router({
  // Tenant-scoped list, used by the owner dashboard.
  list: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(schema.resource)
      .where(eq(schema.resource.organizationId, ctx.organizationId)),
  ),

  // Public list resolved by org slug, used by the booking page.
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
