import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { encrypt, REDACTED_SECRET } from '../crypto';
import { router, tenantProcedure } from '../trpc';

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
        // `null` clears the URL (revert to letter badge), undefined leaves it alone.
        logoUrl: z.string().url().nullable().optional(),
        profession: z.string().optional(),
        templateId: z.string().optional(),
        currency: z.enum(['USD', 'INR']).optional(),
        enableSms: z.boolean().optional(),
        enableWhatsapp: z.boolean().optional(),
        stripeAccountId: z.string().nullable().optional(),
        cashfreeMerchantId: z.string().nullable().optional(),
        // Plain text in on the wire (HTTPS); we encrypt before write.
        // Pass null to clear the saved key.
        cashfreeApiKey: z.string().nullable().optional(),
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
