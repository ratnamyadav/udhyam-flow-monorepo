import { createHmac, timingSafeEqual } from 'node:crypto';
import { autoInvoiceIfEnabled } from '@udyamflow/api/invoicing';
import { db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { after, type NextRequest } from 'next/server';

// Cashfree PG webhook. Signature spec:
//   signature = base64(hmacSHA256(secret, timestamp + rawBody))
// We compare in constant time and reject on mismatch.

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
  const expected = createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('base64');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return new Response('Bad signature', { status: 400 });
  }

  const event = JSON.parse(rawBody) as {
    type: string;
    data: {
      order: { order_id: string; order_status?: string };
      payment?: { payment_status?: string };
    };
  };

  const bookingId = event.data.order.order_id;
  if (event.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    await db
      .update(schema.booking)
      .set({ paymentStatus: 'paid' })
      .where(eq(schema.booking.id, bookingId));
    // No-op unless the tenant turned on auto-invoicing.
    after(() => autoInvoiceIfEnabled(db, bookingId));
  } else if (event.type === 'PAYMENT_FAILED_WEBHOOK') {
    await db
      .update(schema.booking)
      .set({ paymentStatus: 'failed' })
      .where(eq(schema.booking.id, bookingId));
  } else if (event.type === 'REFUND_STATUS_WEBHOOK') {
    await db
      .update(schema.booking)
      .set({ paymentStatus: 'refunded' })
      .where(eq(schema.booking.id, bookingId));
  }

  return Response.json({ received: true });
}
