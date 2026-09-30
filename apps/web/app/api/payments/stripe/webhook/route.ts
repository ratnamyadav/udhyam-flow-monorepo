import { getStripe, markBookingPaid, markPaymentFailed, recordRefundTotal } from '@udyamflow/api';
import {
  autoInvoiceIfEnabled,
  recordStripeInvoice,
  syncStripeInvoiceStatus,
} from '@udyamflow/api/invoicing';
import { db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { after, type NextRequest } from 'next/server';

// Stripe webhook. Source of truth for marking bookings paid — we don't trust
// the success_url redirect because the user can close the tab.
//
// Two Stripe endpoints point here, each with its own signing secret:
//   1. Platform events → STRIPE_WEBHOOK_SECRET
//   2. Connect events ("events on connected accounts") → STRIPE_CONNECT_WEBHOOK_SECRET.
//      `event.account` is the tenant's Express account id.
//
// All state changes go through the guarded transitions in @udyamflow/api, so
// retries and out-of-order deliveries are harmless.

// Types come from @udyamflow/api's Stripe instance — the web app resolves a
// second copy of the `stripe` package whose types don't unify with it.
type StripeClient = NonNullable<ReturnType<typeof getStripe>>;
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
type CheckoutSession = Extract<
  StripeEvent,
  { type: 'checkout.session.completed' }
>['data']['object'];

function verify(stripe: StripeClient, rawBody: string, signature: string): StripeEvent | null {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET];
  for (const secret of secrets) {
    if (!secret) continue;
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      // Try the other endpoint's secret.
    }
  }
  return null;
}

// A checkout event only counts for a booking if it came from the merchant
// account that booking's checkout was opened on and charged the snapshot
// amount. Otherwise a tenant could pay a session on their own Connect
// account carrying another tenant's booking id.
async function bookingForSession(event: StripeEvent, session: CheckoutSession) {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return null;
  const [booking] = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
  if (!booking) return null;
  const account = event.account ?? null;
  // Bookings made before price snapshots existed carry neither the amount
  // nor the account — only the provider can be checked for those.
  const legacy = booking.amountCents == null;
  const matches =
    booking.paymentProvider === 'stripe' &&
    (legacy ||
      ((booking.paymentAccountId ?? null) === account &&
        session.amount_total === booking.amountCents &&
        session.currency?.toUpperCase() === booking.currency?.toUpperCase()));
  if (!matches) {
    console.error(
      `[stripe] ignoring ${event.type} ${event.id}: does not match booking ${bookingId}`,
    );
    return null;
  }
  return booking;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (
    !stripe ||
    (!process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_CONNECT_WEBHOOK_SECRET)
  ) {
    return new Response('Stripe not configured', { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const rawBody = await req.text();
  const event = verify(stripe, rawBody, signature);
  if (!event) return new Response('Bad signature', { status: 400 });

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      // `completed` also fires for delayed methods (bank debits) before the
      // money moves — those settle via async_payment_succeeded.
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        break;
      }
      const booking = await bookingForSession(event, session);
      if (!booking) break;
      const outcome = await markBookingPaid(db, { bookingId: booking.id, paymentId: session.id });
      if (outcome !== 'confirmed') break;

      // Invoicing runs after the 200 so a slow provider can't make Stripe
      // retry the webhook. If Checkout generated an invoice (built-in Stripe
      // invoicing), mirror it; otherwise issue via the tenant's provider.
      const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id;
      const reqOpts = event.account ? { stripeAccount: event.account } : undefined;
      after(async () => {
        try {
          if (invoiceId) {
            const invoice = await stripe.invoices.retrieve(invoiceId, {}, reqOpts);
            await recordStripeInvoice(db, {
              organizationId: booking.organizationId,
              bookingId: booking.id,
              invoice,
            });
          } else {
            await autoInvoiceIfEnabled(db, booking.id);
          }
        } catch (err) {
          console.error(`[invoicing] post-checkout invoicing failed for ${booking.id}:`, err);
        }
      });
      break;
    }
    case 'invoice.paid':
    case 'invoice.voided':
    case 'invoice.marked_uncollectible':
    case 'invoice.finalized': {
      // Keeps invoices issued from UdyamFlow (and the bookings they bill)
      // in sync when the customer pays or the tenant voids in Stripe.
      await syncStripeInvoiceStatus(db, event.data.object, { account: event.account ?? null });
      break;
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object;
      const booking = await bookingForSession(event, session);
      if (booking) {
        await markPaymentFailed(db, {
          bookingId: booking.id,
          paymentId: session.id,
          releaseHold: true,
        });
      }
      break;
    }
    case 'charge.refunded': {
      // Charges don't carry the session metadata; the payment intent does.
      const charge = event.data.object;
      const piId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (!piId) break;
      const reqOpts = event.account ? { stripeAccount: event.account } : undefined;
      const pi = await stripe.paymentIntents.retrieve(piId, {}, reqOpts);
      const bookingId = pi.metadata?.bookingId;
      if (!bookingId) break;
      const [booking] = await db
        .select({ paymentAccountId: schema.booking.paymentAccountId })
        .from(schema.booking)
        .where(eq(schema.booking.id, bookingId));
      if (!booking || (booking.paymentAccountId ?? null) !== (event.account ?? null)) break;
      await recordRefundTotal(db, { bookingId, refundedCents: charge.amount_refunded });
      break;
    }
    case 'account.updated': {
      // Connect onboarding progress. Mirror `charges_enabled` into our DB so
      // checkout can gate on it without a Stripe round-trip. Only trust it
      // for the tenant whose account this is.
      const account = event.data.object;
      const [tenant] = await db
        .select({ organizationId: schema.tenantSettings.organizationId })
        .from(schema.tenantSettings)
        .where(eq(schema.tenantSettings.stripeAccountId, account.id));
      if (!tenant) break;
      const claimedOrg = account.metadata?.organizationId;
      if (claimedOrg && claimedOrg !== tenant.organizationId) break;
      await db
        .update(schema.tenantSettings)
        .set({ stripeChargesEnabled: account.charges_enabled ?? false, updatedAt: new Date() })
        .where(eq(schema.tenantSettings.organizationId, tenant.organizationId));
      break;
    }
  }

  return Response.json({ received: true });
}
