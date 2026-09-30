import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isStateCode, isValidGstin, stateCodeFromGstin } from '../gst/india';
import { sanitizeInvoicePrefix } from '../gst/tax';
import { freshbooksAuthorizeUrl, freshbooksConfig } from '../invoicing/freshbooks';
import {
  getConnection,
  getPlatformGstThreshold,
  issueInvoiceForBooking,
  requireOrgAdmin,
} from '../invoicing/issue';
import { createOAuthState } from '../invoicing/oauth-state';
import { INVOICE_PROVIDERS } from '../invoicing/types';
import { zohoAuthorizeUrl, zohoConfig } from '../invoicing/zoho';
import { getStripe } from '../stripe';
import { router, tenantProcedure } from '../trpc';

// Invoicing: pick where invoices are issued (built-in GST invoices, Stripe
// Invoicing, or a connected accounting tool), connect FreshBooks / Zoho
// Books, keep the tenant's GST profile, and issue invoices for bookings.

const OAUTH_PROVIDERS = ['freshbooks', 'zoho_books'] as const;
const OAUTH_LABEL = { freshbooks: 'FreshBooks', zoho_books: 'Zoho Books' } as const;

function connectionSummary(c: Awaited<ReturnType<typeof getConnection>>) {
  return {
    connected: !!c,
    businessName: c?.displayName ?? null,
    connectedAt: c?.createdAt ?? null,
  };
}

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
    const [fb, zoho] = await Promise.all([
      getConnection(ctx.db, ctx.organizationId, 'freshbooks'),
      getConnection(ctx.db, ctx.organizationId, 'zoho_books'),
    ]);
    return {
      provider: (settings?.invoiceProvider ?? 'none') as (typeof INVOICE_PROVIDERS)[number],
      autoInvoice: settings?.autoInvoice ?? false,
      stripe: {
        available: !!getStripe(),
        ready: !!settings?.stripeAccountId && !!settings.stripeChargesEnabled,
      },
      freshbooks: { available: !!freshbooksConfig(), ...connectionSummary(fb) },
      zoho: { available: !!zohoConfig(), ...connectionSummary(zoho) },
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
      if (input.provider === 'freshbooks' || input.provider === 'zoho_books') {
        const c = await getConnection(ctx.db, ctx.organizationId, input.provider);
        if (!c) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Connect ${OAUTH_LABEL[input.provider]} first`,
          });
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

  // Returns the provider's consent URL; the browser navigates there and the
  // provider redirects back to /api/integrations/<provider>/callback.
  connect: tenantProcedure
    .input(z.object({ provider: z.enum(OAUTH_PROVIDERS) }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgAdmin(ctx.db, ctx.organizationId, ctx.user.id);
      const state = createOAuthState({ organizationId: ctx.organizationId, userId: ctx.user.id });
      if (input.provider === 'freshbooks') {
        const cfg = freshbooksConfig();
        if (!cfg) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'FreshBooks is not configured',
          });
        }
        return { url: freshbooksAuthorizeUrl({ ...cfg, state }) };
      }
      const cfg = zohoConfig();
      if (!cfg) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Zoho Books is not configured',
        });
      }
      return { url: zohoAuthorizeUrl({ ...cfg, state }) };
    }),

  disconnect: tenantProcedure
    .input(z.object({ provider: z.enum(OAUTH_PROVIDERS) }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgAdmin(ctx.db, ctx.organizationId, ctx.user.id);
      await ctx.db
        .delete(schema.integrationConnection)
        .where(
          and(
            eq(schema.integrationConnection.organizationId, ctx.organizationId),
            eq(schema.integrationConnection.provider, input.provider),
          ),
        );
      await ctx.db
        .update(schema.tenantSettings)
        .set({ invoiceProvider: 'none', updatedAt: new Date() })
        .where(
          and(
            eq(schema.tenantSettings.organizationId, ctx.organizationId),
            eq(schema.tenantSettings.invoiceProvider, input.provider),
          ),
        );
      return { ok: true };
    }),

  gstProfile: tenantProcedure.query(async ({ ctx }) => {
    const [s] = await ctx.db
      .select({
        gstRegistered: schema.tenantSettings.gstRegistered,
        gstin: schema.tenantSettings.gstin,
        legalName: schema.tenantSettings.gstLegalName,
        stateCode: schema.tenantSettings.gstStateCode,
        billingAddress: schema.tenantSettings.billingAddress,
        invoicePrefix: schema.tenantSettings.invoicePrefix,
        gstThresholdCents: schema.tenantSettings.gstThresholdCents,
      })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
    const platformGstThresholdCents = await getPlatformGstThreshold(ctx.db);
    return {
      ...(s ?? {
        gstRegistered: false,
        gstin: null,
        legalName: null,
        stateCode: null,
        billingAddress: null,
        invoicePrefix: 'INV',
        gstThresholdCents: null,
      }),
      // Default set by UdyamFlow admins; applies while the store's own
      // value is null.
      platformGstThresholdCents,
    };
  }),

  updateGstProfile: tenantProcedure
    .input(
      z
        .object({
          gstRegistered: z.boolean(),
          gstin: z
            .string()
            .transform((v) => v.trim().toUpperCase())
            .refine(isValidGstin, 'Invalid GSTIN')
            .nullable(),
          legalName: z.string().trim().min(2).max(120).nullable(),
          stateCode: z.string().refine(isStateCode, 'Pick a state').nullable(),
          billingAddress: z.string().trim().max(400).nullable(),
          invoicePrefix: z.string().max(10),
          // Paise. null = inherit the platform default, 0 = GST on every
          // transaction. Omit to leave unchanged.
          gstThresholdCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
        })
        .refine((v) => !v.gstRegistered || !!v.gstin, {
          message: 'GSTIN is required when GST-registered',
          path: ['gstin'],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrgAdmin(ctx.db, ctx.organizationId, ctx.user.id);
      // A GSTIN pins the state — don't let the two disagree.
      const stateCode = input.gstin ? stateCodeFromGstin(input.gstin) : input.stateCode;
      const patch = {
        gstRegistered: input.gstRegistered,
        gstin: input.gstin,
        gstLegalName: input.legalName,
        gstStateCode: stateCode,
        billingAddress: input.billingAddress,
        invoicePrefix: sanitizeInvoicePrefix(input.invoicePrefix),
        ...(input.gstThresholdCents !== undefined
          ? { gstThresholdCents: input.gstThresholdCents }
          : {}),
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
