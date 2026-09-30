import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { freshbooksAuthorizeUrl, freshbooksConfig } from '../invoicing/freshbooks';
import { getConnection, issueInvoiceForBooking, requireOrgAdmin } from '../invoicing/issue';
import { createOAuthState } from '../invoicing/oauth-state';
import { INVOICE_PROVIDERS } from '../invoicing/types';
import { getStripe } from '../stripe';
import { router, tenantProcedure } from '../trpc';

// Invoicing: pick where invoices are issued (built-in Stripe Invoicing or a
// connected accounting tool), connect FreshBooks, and issue invoices for
// bookings.

export const invoicingRouter = router({
  status: tenantProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select({
        invoiceProvider: schema.tenantSettings.invoiceProvider,
        autoInvoice: schema.tenantSettings.autoInvoice,
        stripeAccountId: schema.tenantSettings.stripeAccountId,
        stripeChargesEnabled: schema.tenantSettings.stripeChargesEnabled,
      })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
    const fb = await getConnection(ctx.db, ctx.organizationId, 'freshbooks');
    return {
      provider: (settings?.invoiceProvider ?? 'none') as (typeof INVOICE_PROVIDERS)[number],
      autoInvoice: settings?.autoInvoice ?? false,
      stripe: {
        available: !!getStripe(),
        ready: !!settings?.stripeAccountId && !!settings.stripeChargesEnabled,
      },
      freshbooks: {
        available: !!freshbooksConfig(),
        connected: !!fb,
        businessName: fb?.displayName ?? null,
        connectedAt: fb?.createdAt ?? null,
      },
    };
  }),

  updateSettings: tenantProcedure
    .input(
      z.object({
        provider: z.enum(INVOICE_PROVIDERS).optional(),
        autoInvoice: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrgAdmin(ctx.db, ctx.organizationId, ctx.user.id);
      if (input.provider === 'freshbooks') {
        const fb = await getConnection(ctx.db, ctx.organizationId, 'freshbooks');
        if (!fb) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Connect FreshBooks first' });
        }
      }
      if (input.provider === 'stripe') {
        const [s] = await ctx.db
          .select({
            accountId: schema.tenantSettings.stripeAccountId,
            chargesEnabled: schema.tenantSettings.stripeChargesEnabled,
          })
          .from(schema.tenantSettings)
          .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
        if (!getStripe() || !s?.accountId || !s.chargesEnabled) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Finish Stripe onboarding in Settings → Payments first',
          });
        }
      }
      const patch = {
        ...(input.provider !== undefined ? { invoiceProvider: input.provider } : {}),
        ...(input.autoInvoice !== undefined ? { autoInvoice: input.autoInvoice } : {}),
      };
      await ctx.db
        .insert(schema.tenantSettings)
        .values({ organizationId: ctx.organizationId, ...patch })
        .onConflictDoUpdate({
          target: schema.tenantSettings.organizationId,
          set: { ...patch, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  // Returns the FreshBooks consent URL; the browser navigates there and
  // FreshBooks redirects back to /api/integrations/freshbooks/callback.
  connectFreshbooks: tenantProcedure.mutation(async ({ ctx }) => {
    await requireOrgAdmin(ctx.db, ctx.organizationId, ctx.user.id);
    const cfg = freshbooksConfig();
    if (!cfg) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'FreshBooks is not configured' });
    }
    const state = createOAuthState({ organizationId: ctx.organizationId, userId: ctx.user.id });
    return { url: freshbooksAuthorizeUrl({ ...cfg, state }) };
  }),

  disconnectFreshbooks: tenantProcedure.mutation(async ({ ctx }) => {
    await requireOrgAdmin(ctx.db, ctx.organizationId, ctx.user.id);
    await ctx.db
      .delete(schema.integrationConnection)
      .where(
        and(
          eq(schema.integrationConnection.organizationId, ctx.organizationId),
          eq(schema.integrationConnection.provider, 'freshbooks'),
        ),
      );
    await ctx.db
      .update(schema.tenantSettings)
      .set({ invoiceProvider: 'none', updatedAt: new Date() })
      .where(
        and(
          eq(schema.tenantSettings.organizationId, ctx.organizationId),
          eq(schema.tenantSettings.invoiceProvider, 'freshbooks'),
        ),
      );
    return { ok: true };
  }),

  list: tenantProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(500).default(200) }).default({ limit: 200 }),
    )
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(schema.invoice)
        .where(eq(schema.invoice.organizationId, ctx.organizationId))
        .orderBy(desc(schema.invoice.createdAt))
        .limit(input.limit),
    ),

  // Idempotent: returns the existing invoice if the booking already has one.
  create: tenantProcedure
    .input(z.object({ bookingId: z.string(), send: z.boolean().default(true) }))
    .mutation(({ ctx, input }) =>
      issueInvoiceForBooking(ctx.db, {
        organizationId: ctx.organizationId,
        bookingId: input.bookingId,
        send: input.send,
      }),
    ),
});
