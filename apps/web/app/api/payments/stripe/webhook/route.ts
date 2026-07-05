import { db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';

// Stripe webhook. Source of truth for marking bookings paid — we don't trust
// the success_url redirect because the user can close the tab.
//
// Two event sources flow through this endpoint:
//   1. Platform events (checkout/refunds on the platform account).
//   2. Connect events — `event.account` is set to the tenant's Express
//      account id. Checkout-related lookups need `{ stripeAccount }` to
//      hit the connected account when present.

let _stripe: Stripe | null = null;
function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key);
  return _stripe;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return new Response('Stripe not configured', { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return new Response(`Bad signature: ${(err as Error).message}`, { status: 400 });
  }

  // For Connect events, every Stripe API call we make below must include
  // `stripeAccount` to hit the right connected account.
  const stripeAccount = event.account;
  const reqOpts = stripeAccount ? { stripeAccount } : undefined;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      await db
        .update(schema.booking)
        .set({ paymentStatus: 'paid' })
        .where(eq(schema.booking.id, bookingId));
    }
  } else if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      await db
        .update(schema.booking)
        .set({ paymentStatus: 'failed' })
        .where(eq(schema.booking.id, bookingId));
    }
  } else if (event.type === 'charge.refunded') {
    // Find the booking via payment_intent → checkout session metadata.
    const charge = event.data.object;
    const paymentIntent =
      typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (paymentIntent) {
      const sessions = await stripe.checkout.sessions.list(
        { payment_intent: paymentIntent, limit: 1 },
        reqOpts,
      );
      const bookingId = sessions.data[0]?.metadata?.bookingId;
      if (bookingId) {
        await db
          .update(schema.booking)
          .set({ paymentStatus: 'refunded' })
          .where(eq(schema.booking.id, bookingId));
      }
    }
  } else if (event.type === 'account.updated') {
    // Connect onboarding progress. Mirror `charges_enabled` into our DB
    // so the checkout path can gate on it without a Stripe round-trip.
    const account = event.data.object;
    if (account.id) {
      await db
        .update(schema.tenantSettings)
        .set({ stripeChargesEnabled: account.charges_enabled ?? false })
        .where(eq(schema.tenantSettings.stripeAccountId, account.id));
    }
  }

  return Response.json({ received: true });
}
