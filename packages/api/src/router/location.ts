import { randomUUID } from 'node:crypto';
import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { router, tenantProcedure } from '../trpc';

export const locationRouter = router({
  list: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(schema.location)
      .where(eq(schema.location.organizationId, ctx.organizationId)),
  ),

  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(2),
        address: z.string().optional(),
        timezone: z.string().default('Asia/Kolkata'),
        currency: z.enum(['USD', 'INR']).default('INR'),
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
});
