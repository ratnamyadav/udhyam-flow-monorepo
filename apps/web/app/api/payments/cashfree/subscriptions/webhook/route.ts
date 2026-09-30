import {
  applySubscriptionWebhook,
  cashfreeSubscriptionsFromEnv,
  parseSubscriptionWebhook,
  verifyCashfreeSignature,
} from '@udyamflow/api/memberships';
import { db } from '@udyamflow/db';
import type { NextRequest } from 'next/server';

// Cashfree Subscriptions webhook (mandate status + recurring debits).
// Same signature scheme as the PG webhook:
//   signature = base64(hmacSHA256(client secret, timestamp + rawBody))
// Unknown / non-subscription events are acknowledged with 200 so Cashfree
// doesn't retry them forever; payments are idempotent on cf_payment_id.

export async function POST(req: NextRequest) {
  const secret = process.env.CASHFREE_CLIENT_SECRET;
  if (!secret) {
    return new Response('Cashfree not configured', { status: 503 });
  }

  const signature = req.headers.get('x-webhook-signature');
  const timestamp = req.headers.get('x-webhook-timestamp');
  if (!signature || !timestamp) {
    return new Response('Missing signature headers', { status: 400 });
  }

  const rawBody = await req.text();
  if (!verifyCashfreeSignature({ secret, signature, timestamp, rawBody })) {
    return new Response('Bad signature', { status: 400 });
  }

  const event = parseSubscriptionWebhook(rawBody);
  if (!event) return new Response('Bad payload', { status: 400 });

  const result = await applySubscriptionWebhook(db, cashfreeSubscriptionsFromEnv(), event);
  if (!result.handled) {
    console.info(`[memberships] ignored Cashfree ${event.type}: ${result.reason}`);
  }
  return Response.json({ received: true });
}
