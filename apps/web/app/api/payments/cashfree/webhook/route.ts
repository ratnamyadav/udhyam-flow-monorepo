import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  bookingIdFromOrderId,
  capturePayment,
  markPaymentFailed,
  recordProviderRefund,
} from '@udyamflow/api';
import { autoInvoiceIfEnabled } from '@udyamflow/api/invoicing';
import { db, schema } from '@udyamflow/db';
import { and, eq, or } from 'drizzle-orm';
import { after, type NextRequest } from 'next/server';

// Cashfree PG webhook. Signature spec:
//   signature = base64(hmacSHA256(client secret, timestamp + rawBody))
// All orders are created on the platform account (tenants are paid out via
// Easy Split), so the platform secret signs every event. We compare in
// constant time, reject stale timestamps, and only mark a booking paid when
// the order amount matches its price snapshot.

const MAX_SKEW_MS = 10 * 60 * 1000;

type CashfreeEvent = {
  type: string;
  data: {
    order?: { order_id?: string; order_amount?: number; order_currency?: string };
    payment?: { payment_status?: string };
    refund?: {
      order_id?: string;
      refund_amount?: number;
      refund_status?: string;
      refund_id?: string;
      cf_refund_id?: string;
    };
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

  const secret = process.env.CASHFREE_CLIENT_SECRET;
  if (!secret) return new Response('Cashfree not configured', { status: 503 });

  const rawBody = await req.text();
  if (!signatureMatches(secret, timestamp, rawBody, signature)) {
    return new Response('Bad signature', { status: 400 });
  }
  let event: CashfreeEvent;
  try {
    event = JSON.parse(rawBody) as CashfreeEvent;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // Refund events carry the order id under `refund`, payment events under `order`.
  const orderId = event.data?.refund?.order_id ?? event.data?.order?.order_id;
  const [attempt] = orderId
    ? await db
        .select()
        .from(schema.paymentAttempt)
        .where(
          and(
            eq(schema.paymentAttempt.provider, 'cashfree'),
            or(
              eq(schema.paymentAttempt.id, orderId),
              eq(schema.paymentAttempt.providerPaymentId, orderId),
            ),
          ),
        )
    : [];
  const bookingId = attempt?.bookingId ?? (orderId ? bookingIdFromOrderId(orderId) : null);
  const [booking] = bookingId
    ? await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId))
    : [];

  // Unknown order (e.g. a test event from the dashboard): acknowledge.
  if (
    !booking ||
    !orderId ||
    (attempt ? attempt.provider !== 'cashfree' : booking.paymentProvider !== 'cashfree')
  )
    return Response.json({ received: true });

  if (event.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    const order = event.data.order;
    // Bookings made before price snapshots existed have no amount to check.
    const amountMatches =
      booking.amountCents == null ||
      (Math.round((order?.order_amount ?? -1) * 100) === booking.amountCents &&
        order?.order_currency?.toUpperCase() === booking.currency?.toUpperCase());
    if (event.data.payment?.payment_status === 'SUCCESS' && amountMatches) {
      if (attempt)
        await db
          .update(schema.paymentAttempt)
          .set({ status: 'paid', providerPaymentId: orderId })
          .where(eq(schema.paymentAttempt.id, attempt.id));
      // Refunds only when this delivery captured money for a booking already
      // cancelled or expired — never on a redelivery for one staff kept paid.
      const { outcome, booking: latest } = await capturePayment(db, {
        bookingId: booking.id,
        paymentId: orderId,
        provider: 'cashfree',
        vendorId: attempt?.vendorId ?? booking.paymentVendorId,
      });
      // No-op unless the tenant turned on auto-invoicing.
      if (
        latest?.status === 'confirmed' &&
        (outcome === 'confirmed' || outcome === 'already_settled')
      )
        after(() => autoInvoiceIfEnabled(db, booking.id));
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
    if (refund?.refund_amount != null && refund.refund_id && refund.refund_status) {
      await recordProviderRefund(db, {
        bookingId: booking.id,
        provider: 'cashfree',
        providerRefundId: refund.refund_id,
        localId: refund.refund_id.startsWith('rfd_') ? refund.refund_id : undefined,
        paymentId: orderId,
        amountCents: Math.round(refund.refund_amount * 100),
        status: refund.refund_status,
      });
    }
  }

  return Response.json({ received: true });
}
