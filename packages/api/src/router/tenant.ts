import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { fontIdFrom, readableTextOn } from '@udyamflow/tokens';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { encrypt, REDACTED_SECRET } from '../crypto';
import { bookingLayout, fontId, hexColor } from '../lib/validate';
import { publicProcedure, router, tenantAdminProcedure, tenantProcedure } from '../trpc';

const profession = z.enum(['doctor', 'teacher', 'sports', 'salon', 'therapist', 'fitness']);

export const tenantRouter = router({
  // Public brand for a tenant's booking surfaces (mobile booking flow,
  // embeds). Only presentation fields — never payment config.
  publicBranding: publicProcedure
    .input(z.object({ orgSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ org: schema.organization, settings: schema.tenantSettings })
        .from(schema.organization)
        .leftJoin(
          schema.tenantSettings,
          eq(schema.tenantSettings.organizationId, schema.organization.id),
        )
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Business not found.' });
      const s = row.settings;
      const accent = s?.accent ?? '#0f766e';
      return {
        name: row.org.name,
        slug: row.org.slug,
        profession: s?.profession ?? 'doctor',
        logoText: s?.logoText ?? row.org.name.slice(0, 2).toUpperCase(),
        logoUrl: s?.logoUrl ?? null,
        accent,
        accentSoft: s?.accentSoft ?? '#ccfbf1',
        accentInk: s?.accentInk ?? '#134e4a',
        accentFg: readableTextOn(accent),
        radius: s?.radius ?? 8,
        fontDisplay: fontIdFrom(s?.fontDisplay),
        fontUi: fontIdFrom(s?.fontUi),
        bookingLayout: s?.bookingLayout ?? 'sidebar',
        bookingHeadline: s?.bookingHeadline ?? null,
        bookingIntro: s?.bookingIntro ?? null,
      };
    }),

  getSettings: tenantProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select()
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
    if (!settings) return null;
    // Never leak the encrypted Cashfree key back to the client — replace
    // with a sentinel the UI renders as "•••••• Saved". The payment router
    // reads the real value directly from the DB at checkout time.
    return {
      ...settings,
      // Normalized to font ids (older rows stored CSS stacks).
      fontDisplay: fontIdFrom(settings.fontDisplay),
      fontUi: fontIdFrom(settings.fontUi),
      cashfreeApiKey: settings.cashfreeApiKey ? REDACTED_SECRET : null,
    };
  }),

  updateSettings: tenantAdminProcedure
    .input(
      z.object({
        accent: hexColor.optional(),
        accentSoft: hexColor.optional(),
        accentInk: hexColor.optional(),
        radius: z.number().int().min(0).max(24).optional(),
        density: z.enum(['compact', 'comfortable']).optional(),
        fontDisplay: fontId.optional(),
        fontUi: fontId.optional(),
        bookingLayout: bookingLayout.optional(),
        // Booking page copy; null/empty = the profession's default wording.
        bookingHeadline: z.string().trim().max(120).nullable().optional(),
        bookingIntro: z.string().trim().max(600).nullable().optional(),
        logoText: z.string().max(4).optional(),
        // `null` clears the URL (revert to letter badge), undefined leaves it alone.
        logoUrl: z.string().url().nullable().optional(),
        profession: profession.optional(),
        templateId: profession.optional(),
        currency: z.enum(['USD', 'INR']).optional(),
        enableSms: z.boolean().optional(),
        enableWhatsapp: z.boolean().optional(),
        // stripeAccountId is deliberately absent: it's only ever set by
        // payment.connectStripe, never by the client — otherwise a tenant
        // could point its checkouts at someone else's Connect account.
        cashfreeMerchantId: z.string().max(100).nullable().optional(),
        // Plain text in on the wire (HTTPS); we encrypt before write.
        // Pass null to clear the saved key.
        cashfreeApiKey: z.string().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Encrypt the Cashfree key before persistence. If the UI sends the
      // REDACTED sentinel (because it round-tripped getSettings), don't
      // overwrite — that means the user didn't touch the field.
      const patch: typeof input = { ...input };
      if (patch.bookingHeadline === '') patch.bookingHeadline = null;
      if (patch.bookingIntro === '') patch.bookingIntro = null;
      if (input.cashfreeApiKey === REDACTED_SECRET) {
        delete patch.cashfreeApiKey;
      } else if (typeof input.cashfreeApiKey === 'string' && input.cashfreeApiKey.length > 0) {
        patch.cashfreeApiKey = encrypt(input.cashfreeApiKey);
      }

      await ctx.db
        .insert(schema.tenantSettings)
        .values({ organizationId: ctx.organizationId, ...patch })
        .onConflictDoUpdate({
          target: schema.tenantSettings.organizationId,
          set: { ...patch, updatedAt: new Date() },
        });
      return { ok: true };
    }),
});
