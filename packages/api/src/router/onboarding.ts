import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { atomic, isConflictError, schema } from '@udyamflow/db';
import { TENANT_THEMES, type TenantId } from '@udyamflow/tokens';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { currency, fontStack, hexColor, timeZone } from '../lib/validate';
import { protectedProcedure, router, tenantAdminProcedure } from '../trpc';

const brandInput = z.object({
  accent: hexColor.optional(),
  accentSoft: hexColor.optional(),
  accentInk: hexColor.optional(),
  radius: z.number().int().min(0).max(24).optional(),
  logoText: z.string().trim().min(1).max(4).optional(),
  fontDisplay: fontStack.optional(),
  fontUi: fontStack.optional(),
});

const locationInput = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().max(300).optional(),
  timezone: timeZone,
  currency,
});

export const onboardingRouter = router({
  // Creates the whole workspace in one atomic write — org, owner membership,
  // settings + brand, and locations — and makes it the caller's active org.
  // Previously these were separate client calls, so a failure half-way
  // left an orphan org and a user who couldn't retry (slug already taken).
  createOrganization: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        slug: z
          .string()
          .min(2)
          .max(60)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes'),
        templateId: z.enum(['doctor', 'teacher', 'sports', 'salon', 'therapist', 'fitness']),
        brand: brandInput.optional(),
        locations: z.array(locationInput).max(20).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = `org_${randomUUID()}`;
      const initials = input.name.slice(0, 2).toUpperCase();
      const brand = input.brand ?? {};
      try {
        await atomic(ctx.db, [
          ctx.db.insert(schema.organization).values({
            id: orgId,
            name: input.name,
            slug: input.slug,
            logo: initials,
          }),
          ctx.db.insert(schema.member).values({
            id: `mem_${randomUUID()}`,
            userId: ctx.session.user.id,
            organizationId: orgId,
            role: 'owner',
          }),
          ctx.db.insert(schema.tenantSettings).values({
            organizationId: orgId,
            profession: input.templateId,
            templateId: input.templateId,
            ...brand,
            logoText: brand.logoText?.toUpperCase() ?? initials,
            currency: input.locations[0]?.currency ?? 'USD',
            onboardingStep: 5,
          }),
          ...input.locations.map((l) =>
            ctx.db
              .insert(schema.location)
              .values({ id: `loc_${randomUUID()}`, organizationId: orgId, ...l }),
          ),
          ctx.db
            .update(schema.session)
            .set({ activeOrganizationId: orgId, updatedAt: new Date() })
            .where(eq(schema.session.id, ctx.session.session.id)),
        ]);
      } catch (err) {
        if (isConflictError(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'That booking URL is already taken — pick another.',
          });
        }
        throw err;
      }
      return { organizationId: orgId, slug: input.slug };
    }),

  applyPreset: tenantAdminProcedure
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

  setStep: tenantAdminProcedure
    .input(z.object({ step: z.number().int().min(1).max(5) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(schema.tenantSettings)
        .set({ onboardingStep: input.step, updatedAt: new Date() })
        .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
      return { ok: true };
    }),
});
