import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { and, eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { z } from 'zod';
import { publicProcedure, router, tenantProcedure } from '../trpc';

// Stripe Connect onboarding details. Express accounts are the right default
// for SaaS — Stripe owns the dashboard, payouts, and KYC flow; we just
// handle bookings + checkout.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Per-region default routing: services priced in INR go through Cashfree
// (best UPI / Indian-banking coverage); everything else routes to Stripe.
// We currently use platform-level accounts — a future iteration will add
// per-tenant Stripe Connect via the `stripe_account_id` column already in
// tenant_settings.

const INR_CURRENCIES = new Set(['INR']);

function pickProvider(currency: string): 'stripe' | 'cashfree' | 'none' {
  const upper = currency.toUpperCase();
  if (INR_CURRENCIES.has(upper)) {
    return process.env.CASHFREE_CLIENT_ID ? 'cashfree' : 'none';
  }
  return process.env.STRIPE_SECRET_KEY ? 'stripe' : 'none';
}

let _stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key);
  return _stripe;
}

async function cashfreeCreateOrder(args: {
  orderId: string;
  amount: number; // in INR (not paise)
  currency: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  returnUrl: string;
}): Promise<{ paymentSessionId: string }> {
  const env = process.env.CASHFREE_ENV ?? 'sandbox';
  const base =
    env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  const res = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: {
      'x-client-id': process.env.CASHFREE_CLIENT_ID!,
      'x-client-secret': process.env.CASHFREE_CLIENT_SECRET!,
      'x-api-version': '2023-08-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order_id: args.orderId,
      order_amount: args.amount,
      order_currency: args.currency,
      customer_details: {
        customer_id: args.orderId, // dedupe per-booking is fine
        customer_name: args.customerName,
        customer_email: args.customerEmail ?? 'noemail@example.com',
        customer_phone: args.customerPhone ?? '0000000000',
      },
      order_meta: { return_url: args.returnUrl },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cashfree create-order failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { payment_session_id: string };
  return { paymentSessionId: json.payment_session_id };
}

export const paymentRouter = router({
  // Quick check — does this booking need a checkout step?
  route: publicProcedure
    .input(z.object({ bookingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [booking] = await ctx.db
        .select({
          id: schema.booking.id,
          serviceId: schema.booking.serviceId,
          paymentStatus: schema.booking.paymentStatus,
        })
        .from(schema.booking)
        .where(eq(schema.booking.id, input.bookingId));
      if (!booking) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!booking.serviceId) return { provider: 'none' as const, amount: 0, currency: 'USD' };

      const [svc] = await ctx.db
        .select({
          priceCents: schema.service.priceCents,
          currency: schema.service.currency,
        })
        .from(schema.service)
        .where(eq(schema.service.id, booking.serviceId));
      if (!svc || svc.priceCents === 0) {
        return { provider: 'none' as const, amount: 0, currency: 'USD' };
      }

      return {
        provider: pickProvider(svc.currency),
        amount: svc.priceCents,
        currency: svc.currency,
      };
    }),

  createCheckout: publicProcedure
    .input(z.object({ bookingId: z.string(), returnUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const [booking] = await ctx.db
        .select()
        .from(schema.booking)
        .where(eq(schema.booking.id, input.bookingId));
      if (!booking) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!booking.serviceId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No service on booking' });
      }

      const [svc] = await ctx.db
        .select()
        .from(schema.service)
        .where(eq(schema.service.id, booking.serviceId));
      if (!svc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service vanished' });

      const provider = pickProvider(svc.currency);
      if (provider === 'none') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No payment provider configured for this currency',
        });
      }

      if (provider === 'stripe') {
        const stripe = getStripe();
        if (!stripe) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        // Per-tenant Connect routing. If the tenant has finished Stripe
        // onboarding (charges_enabled), funds settle directly to their
        // account via the Stripe-Account header. Otherwise fall back to
        // the platform account so existing setups keep working.
        const [tenant] = await ctx.db
          .select({
            accountId: schema.tenantSettings.stripeAccountId,
            chargesEnabled: schema.tenantSettings.stripeChargesEnabled,
          })
          .from(schema.tenantSettings)
          .where(eq(schema.tenantSettings.organizationId, booking.organizationId));
        const connectAccount =
          tenant?.accountId && tenant.chargesEnabled ? tenant.accountId : undefined;

        const session = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: svc.currency.toLowerCase(),
                  unit_amount: svc.priceCents,
                  product_data: { name: svc.name },
                },
              },
            ],
            metadata: {
              bookingId: booking.id,
              organizationId: booking.organizationId,
            },
            success_url: `${input.returnUrl}?status=paid&booking=${booking.id}`,
            cancel_url: `${input.returnUrl}?status=cancelled&booking=${booking.id}`,
          },
          // `stripeAccount` makes Stripe route the API call against the
          // connected account — checkout session, payment intent, and
          // payout all live on the tenant's side of the ledger.
          connectAccount ? { stripeAccount: connectAccount } : undefined,
        );
        await ctx.db
          .update(schema.booking)
          .set({
            paymentStatus: 'pending',
            paymentProvider: 'stripe',
            paymentId: session.id,
          })
          .where(eq(schema.booking.id, booking.id));
        return { redirectUrl: session.url! };
      }

      // Cashfree
      const { paymentSessionId } = await cashfreeCreateOrder({
        orderId: booking.id,
        amount: svc.priceCents / 100,
        currency: svc.currency,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail ?? undefined,
        customerPhone: booking.customerPhone ?? undefined,
        returnUrl: `${input.returnUrl}?status=paid&booking=${booking.id}`,
      });
      await ctx.db
        .update(schema.booking)
        .set({
          paymentStatus: 'pending',
          paymentProvider: 'cashfree',
          paymentId: paymentSessionId,
        })
        .where(eq(schema.booking.id, booking.id));

      const env = process.env.CASHFREE_ENV ?? 'sandbox';
      const checkoutHost =
        env === 'production'
          ? 'https://payments.cashfree.com'
          : 'https://payments-test.cashfree.com';
      return {
        redirectUrl: `${checkoutHost}/order/#${paymentSessionId}`,
      };
    }),

  // Stripe Connect — Express onboarding. Reuses an existing account if one
  // was already created for this tenant; otherwise spins up a fresh one.
  // Returns a one-time onboarding URL the user should be redirected to.
  connectStripe: tenantProcedure.mutation(async ({ ctx }) => {
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

  refund: tenantProcedure
    .input(z.object({ bookingId: z.string(), amount: z.number().int().min(1).optional() }))
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
      if (booking.paymentStatus !== 'paid') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Booking is not paid' });
      }
      if (!booking.paymentProvider || !booking.paymentId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No payment record' });
      }

      if (booking.paymentProvider === 'stripe') {
        const stripe = getStripe();
        if (!stripe) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        // Connect-routed bookings live on the tenant's account. Look up
        // their Stripe account id so retrieve + refund hit the right side.
        const [tenant] = await ctx.db
          .select({ accountId: schema.tenantSettings.stripeAccountId })
          .from(schema.tenantSettings)
          .where(eq(schema.tenantSettings.organizationId, ctx.organizationId));
        const reqOpts = tenant?.accountId ? { stripeAccount: tenant.accountId } : undefined;

        // We stored the Checkout Session id; resolve to the underlying
        // payment_intent before refunding.
        // Stripe SDK: 3rd arg is RequestOptions (where stripeAccount goes);
        // 2nd is per-call query params. Pass an empty params object so the
        // RequestOptions arg lands in the right slot.
        const session = await stripe.checkout.sessions.retrieve(booking.paymentId, {}, reqOpts);
        const pi =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
        if (!pi)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Stripe payment intent missing' });
        await stripe.refunds.create({ payment_intent: pi, amount: input.amount }, reqOpts);
      } else if (booking.paymentProvider === 'cashfree') {
        const cfEnv = process.env.CASHFREE_ENV ?? 'sandbox';
        const base =
          cfEnv === 'production'
            ? 'https://api.cashfree.com/pg'
            : 'https://sandbox.cashfree.com/pg';
        const res = await fetch(`${base}/orders/${booking.id}/refunds`, {
          method: 'POST',
          headers: {
            'x-client-id': process.env.CASHFREE_CLIENT_ID!,
            'x-client-secret': process.env.CASHFREE_CLIENT_SECRET!,
            'x-api-version': '2023-08-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refund_amount: input.amount,
            refund_id: `rfd_${booking.id}_${Date.now()}`,
            refund_note: 'Refund from UdyamFlow dashboard',
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: `Cashfree refund failed (${res.status}): ${body.slice(0, 200)}`,
          });
        }
      }

      await ctx.db
        .update(schema.booking)
        .set({ paymentStatus: 'refunded' })
        .where(eq(schema.booking.id, booking.id));
      return { ok: true };
    }),
});
