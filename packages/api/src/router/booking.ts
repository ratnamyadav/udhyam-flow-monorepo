import { randomUUID } from 'node:crypto';
import { schema } from '@udyamflow/db';
import { PROFESSIONS, type ProfessionId } from '@udyamflow/tokens';
import { and, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';
import { publicProcedure, router, tenantProcedure } from '../trpc';

// Booking availability is mocked from PROFESSIONS.sampleSlots for the first cut.
// Real availability layered on later.
export const bookingRouter = router({
  listSlots: publicProcedure
    .input(z.object({ orgSlug: z.string(), date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({ id: schema.organization.id, profession: schema.tenantSettings.profession })
        .from(schema.organization)
        .innerJoin(
          schema.tenantSettings,
          eq(schema.tenantSettings.organizationId, schema.organization.id),
        )
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!org) return { slots: [] as string[] };
      const profession = PROFESSIONS[org.profession as ProfessionId] ?? PROFESSIONS.doctor;
      return { slots: profession.sampleSlots };
    }),

  create: publicProcedure
    .input(
      z.object({
        orgSlug: z.string(),
        resourceId: z.string(),
        locationId: z.string(),
        customerName: z.string().min(2),
        customerEmail: z.email().optional(),
        customerPhone: z.string().optional(),
        slotStart: z.iso.datetime(),
        slotEnd: z.iso.datetime(),
        intake: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!org) throw new Error('Tenant not found');
      const id = `bkg_${randomUUID()}`;
      await ctx.db.insert(schema.booking).values({
        id,
        organizationId: org.id,
        resourceId: input.resourceId,
        locationId: input.locationId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        slotStart: new Date(input.slotStart),
        slotEnd: new Date(input.slotEnd),
        intake: input.intake,
      });
      return { id };
    }),

  listToday: tenantProcedure.query(async ({ ctx }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return ctx.db
      .select()
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, ctx.organizationId),
          gte(schema.booking.slotStart, start),
          lt(schema.booking.slotStart, end),
        ),
      );
  }),
});
