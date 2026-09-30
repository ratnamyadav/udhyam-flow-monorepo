import { TRPCError } from '@trpc/server';
import { type PaymentStatus, schema } from '@udyamflow/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { expireStaleHolds, refundBooking } from '../payments/lifecycle';
import {
  APP_URL,
  CHECKOUT_SESSION_MINUTES,
  cashfreeCheckoutUrl,
  cashfreeCreateOrder,
  cashfreeCredsForOrg,
  cashfreeOrderId,
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
        provider: await pickProvider(ctx.db, booking.organizationId, booking.currency),
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
      if (booking.status !== 'pending_payment' || !booking.amountCents || !booking.currency) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This booking is not awaiting payment.',
        });
      }

      const provider = await pickProvider(ctx.db, booking.organizationId, booking.currency);
      if (provider === 'none') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No payment provider configured for this currency.',
        });
      }

      const returnUrl = `${APP_URL}/book/${row.orgSlug}/confirmation?booking=${booking.id}`;
      const sessionExpiresAt = new Date(Date.now() + CHECKOUT_SESSION_MINUTES * 60_000);
      // Keep the slot held for as long as the gateway session can be paid.
      const holdExpiresAt = new Date(
        Math.max(
          booking.holdExpiresAt?.getTime() ?? 0,
          sessionExpiresAt.getTime() + (HOLD_MINUTES - CHECKOUT_SESSION_MINUTES) * 60_000,
        ),
      );

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
        const session = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: booking.currency.toLowerCase(),
                  unit_amount: booking.amountCents,
                  product_data: { name: row.serviceName ?? 'Booking' },
                },
              },
            ],
            customer_email: booking.customerEmail ?? undefined,
            metadata,
            payment_intent_data: { metadata },
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
            holdExpiresAt,
          })
          .where(
            and(eq(schema.booking.id, booking.id), eq(schema.booking.status, 'pending_payment')),
          );
        if (!session.url) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        return { redirectUrl: session.url };
      }

      // Cashfree — tenant's own account when configured, else the platform's.
      const creds = await cashfreeCredsForOrg(ctx.db, booking.organizationId);
      if (!creds) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const orderId = cashfreeOrderId(booking.id);
      let paymentSessionId: string;
      try {
        ({ paymentSessionId } = await cashfreeCreateOrder(creds, {
          orderId,
          amountCents: booking.amountCents,
          currency: booking.currency,
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
          paymentAccountId: creds.accountTag,
          holdExpiresAt,
        })
        .where(
          and(eq(schema.booking.id, booking.id), eq(schema.booking.status, 'pending_payment')),
        );
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
});
