import { TRPCError } from '@trpc/server';
import { type PaymentStatus, schema } from '@udyamflow/db';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  CashfreeError,
  cashfreeCheckoutUrl,
  cashfreeConfigured,
  cashfreeCreateOrder,
  cashfreeCreateVendor,
  cashfreeFetchVendor,
  vendorIdForOrg,
} from '../cashfree';
import { isValidGstin, isValidIfsc, isValidPan, normalizeIndianMobile } from '../gst/india';
import { expireStaleHolds, refundBooking } from '../payments/lifecycle';
import {
  APP_URL,
  CHECKOUT_SESSION_MINUTES,
  cashfreeOrderId,
  cashfreeVendorFor,
  getStripe,
  HOLD_MINUTES,
  pickProvider,
  stripeConnectAccountFor,
} from '../payments/providers';
import { enforceRateLimit, ipKeyFromHeaders } from '../rate-limit';
import { publicProcedure, router, tenantAdminProcedure, tenantProcedure } from '../trpc';

// Stripe Connect onboarding details. Express accounts are the right default
// for SaaS — Stripe owns the dashboard, payouts, and KYC flow; we just
// handle bookings + checkout.

const SETTLED: PaymentStatus[] = ['paid', 'partially_refunded', 'refunded'];

export const paymentRouter = router({
  // Quick check — does this booking need a checkout step?
  route: publicProcedure
    .input(z.object({ bookingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [booking] = await ctx.db
        .select({
          organizationId: schema.booking.organizationId,
          amountCents: schema.booking.amountCents,
          currency: schema.booking.currency,
        })
        .from(schema.booking)
        .where(eq(schema.booking.id, input.bookingId));
      if (!booking) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!booking.amountCents || !booking.currency) {
        return { provider: 'none' as const, amount: 0, currency: booking.currency ?? 'USD' };
      }
      return {
        provider: pickProvider(booking.currency),
        amount: booking.amountCents,
        currency: booking.currency,
      };
    }),

  // Opens (or reopens) the gateway checkout for a booking that's holding its
  // slot. Public — the customer has no account — so it only ever acts on a
  // `pending_payment` booking and never on anything already paid. The
  // return URL is built server-side; accepting one from the caller would be
  // an open redirect.
  createCheckout: publicProcedure
    .input(z.object({ bookingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit({
        key: `checkout:${ipKeyFromHeaders(ctx.headers)}`,
        limit: 10,
        windowSec: 60,
      });
      await expireStaleHolds(ctx.db);

      const [row] = await ctx.db
        .select({
          booking: schema.booking,
          orgSlug: schema.organization.slug,
          serviceName: schema.service.name,
          servicePriceCents: schema.service.priceCents,
          serviceCurrency: schema.service.currency,
        })
        .from(schema.booking)
        .innerJoin(schema.organization, eq(schema.organization.id, schema.booking.organizationId))
        .leftJoin(schema.service, eq(schema.service.id, schema.booking.serviceId))
        .where(eq(schema.booking.id, input.bookingId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
      const booking = row.booking;

      if (SETTLED.includes(booking.paymentStatus)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This booking is already paid.',
        });
      }
      if (booking.status === 'expired') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Your hold on this slot expired — please book again.',
        });
      }
      // Two ways to owe money: a paid booking holding its slot while the
      // customer checks out (`pending_payment`), or a confirmed booking paid
      // later — the "Pay now" link in reminders, or pay-at-venue bookings
      // made before a gateway was configured. Bookings from before price
      // snapshots fall back to the service's price.
      const holding = booking.status === 'pending_payment';
      const amountCents = booking.amountCents ?? row.servicePriceCents;
      const currency = booking.currency ?? row.serviceCurrency;
      if ((!holding && booking.status !== 'confirmed') || !amountCents || !currency) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This booking is not awaiting payment.',
        });
      }
      const payable = and(
        eq(schema.booking.id, booking.id),
        inArray(schema.booking.status, ['pending_payment', 'confirmed']),
      );

      const provider = pickProvider(currency);
      if (provider === 'none') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No payment provider configured for this currency.',
        });
      }

      const returnUrl = `${APP_URL}/book/${row.orgSlug}/confirmation?booking=${booking.id}`;
      const sessionExpiresAt = new Date(Date.now() + CHECKOUT_SESSION_MINUTES * 60_000);
      // Keep a held slot held for as long as the gateway session can be paid.
      const holdExpiresAt = holding
        ? new Date(
            Math.max(
              booking.holdExpiresAt?.getTime() ?? 0,
              sessionExpiresAt.getTime() + (HOLD_MINUTES - CHECKOUT_SESSION_MINUTES) * 60_000,
            ),
          )
        : null;

      if (provider === 'stripe') {
        const stripe = getStripe();
        if (!stripe) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        // Reuse a still-open session instead of stacking up new ones.
        if (booking.paymentProvider === 'stripe' && booking.paymentId) {
          const reqOpts = booking.paymentAccountId
            ? { stripeAccount: booking.paymentAccountId }
            : undefined;
          const existing = await stripe.checkout.sessions
            .retrieve(booking.paymentId, {}, reqOpts)
            .catch(() => null);
          if (existing?.status === 'open' && existing.url) return { redirectUrl: existing.url };
        }

        // Funds settle to the tenant's Connect account once onboarding is
        // done; otherwise to the platform account.
        const connectAccount = await stripeConnectAccountFor(ctx.db, booking.organizationId);
        const metadata = { bookingId: booking.id, organizationId: booking.organizationId };
        // Tenants on built-in Stripe invoicing with auto-invoice on get a
        // paid invoice generated by Checkout itself; the webhook mirrors it
        // into our invoice table.
        const [invoicing] = await ctx.db
          .select({
            invoiceProvider: schema.tenantSettings.invoiceProvider,
            autoInvoice: schema.tenantSettings.autoInvoice,
          })
          .from(schema.tenantSettings)
          .where(eq(schema.tenantSettings.organizationId, booking.organizationId));
        const stripeInvoice =
          !!connectAccount && invoicing?.invoiceProvider === 'stripe' && invoicing.autoInvoice;
        const session = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: currency.toLowerCase(),
                  unit_amount: amountCents,
                  product_data: { name: row.serviceName ?? 'Booking' },
                },
              },
            ],
            customer_email: booking.customerEmail ?? undefined,
            metadata,
            payment_intent_data: { metadata },
            ...(stripeInvoice
              ? { invoice_creation: { enabled: true, invoice_data: { metadata } } }
              : {}),
            expires_at: Math.floor(sessionExpiresAt.getTime() / 1000),
            success_url: `${returnUrl}&status=paid`,
            cancel_url: `${returnUrl}&status=cancelled`,
          },
          connectAccount ? { stripeAccount: connectAccount } : undefined,
        );
        await ctx.db
          .update(schema.booking)
          .set({
            paymentStatus: 'pending',
            paymentProvider: 'stripe',
            paymentId: session.id,
            paymentAccountId: connectAccount ?? null,
            ...(holdExpiresAt ? { holdExpiresAt } : {}),
          })
          .where(payable);
        if (!session.url) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        return { redirectUrl: session.url };
      }

      // Cashfree. Split to the tenant's Easy Split vendor once it's ACTIVE
      // so the money settles to their bank, not the platform account.
      const vendorId = await cashfreeVendorFor(ctx.db, booking.organizationId);
      if (!vendorId && process.env.CASHFREE_REQUIRE_VENDOR === 'true') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This business has not finished setting up online payments yet.',
        });
      }
      const orderId = cashfreeOrderId(booking.id);
      let paymentSessionId: string;
      try {
        ({ paymentSessionId } = await cashfreeCreateOrder({
          orderId,
          amountPaise: amountCents,
          currency,
          vendorId,
          customerId: booking.customerId ?? booking.id,
          customerName: booking.customerName,
          customerEmail: booking.customerEmail ?? undefined,
          customerPhone: booking.customerPhone ?? undefined,
          returnUrl: `${returnUrl}&status=paid`,
          expiresAt: sessionExpiresAt,
        }));
      } catch (err) {
        console.error(err);
        throw new TRPCError({
          code: 'BAD_GATEWAY',
          message: 'Could not start the payment — please try again.',
        });
      }
      await ctx.db
        .update(schema.booking)
        .set({
          paymentStatus: 'pending',
          paymentProvider: 'cashfree',
          paymentId: orderId,
          paymentVendorId: vendorId ?? null,
          ...(holdExpiresAt ? { holdExpiresAt } : {}),
        })
        .where(payable);
      return { redirectUrl: cashfreeCheckoutUrl(paymentSessionId) };
    }),

  // Stripe Connect — Express onboarding. Reuses an existing account if one
  // was already created for this tenant; otherwise spins up a fresh one.
  // Returns a one-time onboarding URL the user should be redirected to.
  connectStripe: tenantAdminProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe();
    if (!stripe) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Stripe is not configured' });
    }

    const [tenant] = await ctx.db
      .select({ accountId: schema.tenantSettings.stripeAccountId })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));

    let accountId = tenant?.accountId ?? null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { organizationId: ctx.organizationId },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      await ctx.db
        .insert(schema.tenantSettings)
        .values({ organizationId: ctx.organizationId, stripeAccountId: accountId })
        .onConflictDoUpdate({
          target: schema.tenantSettings.organizationId,
          set: { stripeAccountId: accountId, updatedAt: new Date() },
        });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/settings/payments?stripe=refresh`,
      return_url: `${APP_URL}/settings/payments?stripe=done`,
      type: 'account_onboarding',
    });

    return { url: link.url };
  }),

  // Reads tenant-level Stripe status. Used by the settings page to show a
  // "Connected" / "Onboarding" / "Action required" badge without a Stripe
  // call from the browser.
  stripeStatus: tenantProcedure.query(async ({ ctx }) => {
    const [tenant] = await ctx.db
      .select({
        accountId: schema.tenantSettings.stripeAccountId,
        chargesEnabled: schema.tenantSettings.stripeChargesEnabled,
      })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
    return {
      accountId: tenant?.accountId ?? null,
      chargesEnabled: tenant?.chargesEnabled ?? false,
    };
  }),

  // Refunds through the gateway + merchant account that took the payment.
  // `amountCents` omitted = full remaining amount.
  refund: tenantAdminProcedure
    .input(z.object({ bookingId: z.string(), amountCents: z.number().int().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [booking] = await ctx.db
        .select()
        .from(schema.booking)
        .where(
          and(
            eq(schema.booking.id, input.bookingId),
            eq(schema.booking.organizationId, ctx.organizationId),
          ),
        );
      if (!booking) throw new TRPCError({ code: 'NOT_FOUND' });
      const { paymentStatus } = await refundBooking(ctx.db, booking, input.amountCents);
      return { ok: true as const, paymentStatus };
    }),
  // Cashfree Easy Split onboarding: registers the tenant as a vendor with
  // their payout account + KYC. Bank details go straight to Cashfree; we
  // only keep the vendor id, its status and a masked label.
  connectCashfree: tenantAdminProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        email: z.email(),
        phone: z.string(),
        payout: z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('bank'),
            accountHolder: z.string().min(2).max(100),
            accountNumber: z.string().regex(/^\d{9,18}$/, 'Account number must be 9–18 digits'),
            ifsc: z.string().refine(isValidIfsc, 'Invalid IFSC code'),
          }),
          z.object({
            kind: z.literal('upi'),
            accountHolder: z.string().min(2).max(100),
            vpa: z.string().regex(/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/, 'Invalid UPI ID'),
          }),
        ]),
        pan: z.string().refine(isValidPan, 'Invalid PAN'),
        gstin: z.string().refine(isValidGstin, 'Invalid GSTIN').optional(),
        accountType: z.string().min(2).max(40),
        businessType: z.string().min(2).max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!cashfreeConfigured()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Cashfree is not configured' });
      }
      const phone = normalizeIndianMobile(input.phone);
      if (!phone) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter a valid Indian mobile number' });
      }

      const [tenant] = await ctx.db
        .select({ vendorId: schema.tenantSettings.cashfreeVendorId })
        .from(schema.tenantSettings)
        .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
      if (tenant?.vendorId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Payout account already registered. Contact support to change bank details.',
        });
      }

      const vendorId = vendorIdForOrg(ctx.organizationId);
      let state: Awaited<ReturnType<typeof cashfreeCreateVendor>>;
      try {
        state = await cashfreeCreateVendor({
          vendorId,
          name: input.name,
          email: input.email,
          phone,
          payout: input.payout,
          kyc: {
            accountType: input.accountType,
            businessType: input.businessType,
            pan: input.pan,
            gstin: input.gstin,
          },
        });
      } catch (err) {
        throw new TRPCError({
          code: err instanceof CashfreeError && err.status < 500 ? 'BAD_REQUEST' : 'BAD_GATEWAY',
          message: (err as Error).message.slice(0, 240),
          cause: err,
        });
      }

      const label =
        input.payout.kind === 'bank'
          ? `${input.payout.ifsc.slice(0, 4).toUpperCase()} ••${input.payout.accountNumber.slice(-4)}`
          : input.payout.vpa.replace(/^(.{2}).*(@.*)$/, '$1••$2');
      await ctx.db
        .insert(schema.tenantSettings)
        .values({
          organizationId: ctx.organizationId,
          cashfreeVendorId: state.vendorId,
          cashfreeVendorStatus: state.status,
          cashfreePayoutLabel: label,
        })
        .onConflictDoUpdate({
          target: schema.tenantSettings.organizationId,
          set: {
            cashfreeVendorId: state.vendorId,
            cashfreeVendorStatus: state.status,
            cashfreePayoutLabel: label,
            updatedAt: new Date(),
          },
        });
      return { status: state.status, remarks: state.remarks };
    }),

  // Current vendor status. `refresh` re-reads it from Cashfree (bank
  // verification is async), otherwise returns the cached value.
  cashfreeStatus: tenantProcedure
    .input(z.object({ refresh: z.boolean().default(false) }).default({ refresh: false }))
    .query(async ({ ctx, input }) => {
      const [tenant] = await ctx.db
        .select({
          vendorId: schema.tenantSettings.cashfreeVendorId,
          status: schema.tenantSettings.cashfreeVendorStatus,
          label: schema.tenantSettings.cashfreePayoutLabel,
        })
        .from(schema.tenantSettings)
        .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
      const base = {
        configured: cashfreeConfigured(),
        vendorId: tenant?.vendorId ?? null,
        status: tenant?.status ?? null,
        payoutLabel: tenant?.label ?? null,
        remarks: null as string | null,
      };
      if (!input.refresh || !tenant?.vendorId || !base.configured) return base;
      try {
        const latest = await cashfreeFetchVendor(tenant.vendorId);
        if (latest.status !== tenant.status) {
          await ctx.db
            .update(schema.tenantSettings)
            .set({ cashfreeVendorStatus: latest.status, updatedAt: new Date() })
            .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
        }
        return { ...base, status: latest.status, remarks: latest.remarks };
      } catch {
        return base;
      }
    }),
});
