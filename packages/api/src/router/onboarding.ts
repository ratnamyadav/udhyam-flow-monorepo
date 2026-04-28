import { randomUUID } from 'node:crypto';
import { schema } from '@udyamflow/db';
import { TENANT_THEMES, type TenantId } from '@udyamflow/tokens';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { protectedProcedure, router, tenantProcedure } from '../trpc';

export const onboardingRouter = router({
  createOrganization: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        slug: z
          .string()
          .min(2)
          .regex(/^[a-z0-9-]+$/),
        templateId: z.enum(['doctor', 'teacher', 'sports', 'salon', 'therapist', 'fitness']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = `org_${randomUUID()}`;
      await ctx.db.insert(schema.organization).values({
        id: orgId,
        name: input.name,
        slug: input.slug,
        logo: input.name.slice(0, 2).toUpperCase(),
      });
      await ctx.db.insert(schema.member).values({
        id: `mem_${randomUUID()}`,
        userId: ctx.session.user.id,
        organizationId: orgId,
        role: 'owner',
      });
      await ctx.db.insert(schema.tenantSettings).values({
        organizationId: orgId,
        profession: input.templateId,
        templateId: input.templateId,
        logoText: input.name.slice(0, 2).toUpperCase(),
        onboardingStep: 3,
      });
      return { organizationId: orgId };
    }),

  applyPreset: tenantProcedure
    .input(z.object({ preset: z.enum(['patel', 'kavya', 'baseline']) }))
    .mutation(async ({ ctx, input }) => {
      const t = TENANT_THEMES[input.preset as TenantId];
      await ctx.db
        .update(schema.tenantSettings)
        .set({
          accent: t.accent,
          accentSoft: t.accentSoft,
          accentInk: t.accentInk,
          radius: t.radius,
          fontDisplay: t.fontDisplay,
          fontUi: t.fontUI,
          logoText: t.logo,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
      return { ok: true };
    }),

  setStep: tenantProcedure
    .input(z.object({ step: z.number().int().min(1).max(5) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(schema.tenantSettings)
        .set({ onboardingStep: input.step, updatedAt: new Date() })
        .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
      return { ok: true };
    }),
});
