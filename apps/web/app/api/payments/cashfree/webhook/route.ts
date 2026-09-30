import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  bookingIdFromOrderId,
  cashfreeWebhookSecrets,
  markBookingPaid,
  markPaymentFailed,
  recordRefundTotal,
} from '@udyamflow/api';
import { db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

// Cashfree PG webhook. Signature spec:
//   signature = base64(hmacSHA256(secret, timestamp + rawBody))
// The secret is the Secret Key of whichever Cashfree account created the
// order — the tenant's own account or the platform's — so we look up the
// booking first and only accept signatures from that tenant's secrets.

const MAX_SKEW_MS = 10 * 60 * 1000;

type CashfreeEvent = {
  type: string;
  data: {
    order?: { order_id?: string; order_amount?: number; order_currency?: string };
    payment?: { payment_status?: string };
    refund?: { order_id?: string; refund_amount?: number; refund_status?: string };
  };
};

function signatureMatches(secret: string, timestamp: string, rawBody: string, signature: string) {
  const expected = createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('base64');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
}

// Rejects stale deliveries so a captured payload can't be replayed later.
function isFresh(timestamp: string): boolean {
  const n = Number(timestamp);
  if (!Number.isFinite(n)) return false;
  const ms = n < 1e12 ? n * 1000 : n; // accept seconds or milliseconds
  return Math.abs(Date.now() - ms) <= MAX_SKEW_MS;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-webhook-signature');
  const timestamp = req.headers.get('x-webhook-timestamp');
  if (!signature || !timestamp) {
    return new Response('Missing signature headers', { status: 400 });
  }
  if (!isFresh(timestamp)) return new Response('Stale webhook', { status: 400 });

  const rawBody = await req.text();
  let event: CashfreeEvent;
  try {
    event = JSON.parse(rawBody) as CashfreeEvent;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // Refund events carry the order id under `refund`, payment events under `order`.
  const orderId = event.data?.refund?.order_id ?? event.data?.order?.order_id;
  const bookingId = orderId ? bookingIdFromOrderId(orderId) : null;
  const [booking] = bookingId
    ? await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId))
    : [];

  const secrets = booking
    ? await cashfreeWebhookSecrets(db, booking.organizationId)
    : [process.env.CASHFREE_CLIENT_SECRET].filter((s): s is string => !!s);
  if (secrets.length === 0) return new Response('Cashfree not configured', { status: 503 });
  if (!secrets.some((s) => signatureMatches(s, timestamp, rawBody, signature))) {
    return new Response('Bad signature', { status: 400 });
  }

  // Unknown order (e.g. a test event from the dashboard): acknowledge.
  if (!booking || !orderId) return Response.json({ received: true });

  if (event.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    const order = event.data.order;
    const amountMatches =
      booking.amountCents != null &&
      Math.round((order?.order_amount ?? -1) * 100) === booking.amountCents &&
      order?.order_currency?.toUpperCase() === booking.currency?.toUpperCase();
    if (event.data.payment?.payment_status === 'SUCCESS' && amountMatches) {
      await markBookingPaid(db, { bookingId: booking.id, paymentId: orderId });
    } else if (!amountMatches) {
      console.error(`[cashfree] amount mismatch for booking ${booking.id}; not marking paid`);
    }
  } else if (
    event.type === 'PAYMENT_FAILED_WEBHOOK' ||
    event.type === 'PAYMENT_USER_DROPPED_WEBHOOK'
  ) {
    // The customer can retry within the same order, so keep the hold; it
    // lapses on its own if they don't.
    await markPaymentFailed(db, { bookingId: booking.id, paymentId: orderId, releaseHold: false });
  } else if (event.type === 'REFUND_STATUS_WEBHOOK') {
    const refund = event.data.refund;
    if (refund?.refund_status === 'SUCCESS' && refund.refund_amount != null) {
      await recordRefundTotal(db, {
        bookingId: booking.id,
        refundedCents: Math.round(refund.refund_amount * 100),
      });
    }
  }

  return Response.json({ received: true });
}
