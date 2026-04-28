import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { router, tenantProcedure } from '../trpc';

export const tenantRouter = router({
  getSettings: tenantProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select()
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
    return settings ?? null;
  }),

  updateSettings: tenantProcedure
    .input(
      z.object({
        accent: z.string().optional(),
        accentSoft: z.string().optional(),
        accentInk: z.string().optional(),
        radius: z.number().int().min(0).max(24).optional(),
        density: z.enum(['compact', 'comfortable']).optional(),
        fontDisplay: z.string().optional(),
        fontUi: z.string().optional(),
        logoText: z.string().max(4).optional(),
        profession: z.string().optional(),
        templateId: z.string().optional(),
        currency: z.enum(['USD', 'INR']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(schema.tenantSettings)
        .values({ organizationId: ctx.organizationId, ...input })
        .onConflictDoUpdate({
          target: schema.tenantSettings.organizationId,
          set: { ...input, updatedAt: new Date() },
        });
      return { ok: true };
    }),
});
