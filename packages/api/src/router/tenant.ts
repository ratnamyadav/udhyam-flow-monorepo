import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { encrypt, REDACTED_SECRET } from '../crypto';
import { fontStack, hexColor } from '../lib/validate';
import { router, tenantAdminProcedure, tenantProcedure } from '../trpc';

const profession = z.enum(['doctor', 'teacher', 'sports', 'salon', 'therapist', 'fitness']);

export const tenantRouter = router({
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
        fontDisplay: fontStack.optional(),
        fontUi: fontStack.optional(),
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
