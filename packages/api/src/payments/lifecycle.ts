import { TRPCError } from '@trpc/server';
import { type Db, isConflictError, type PaymentStatus, schema } from '@udyamflow/db';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { syncInvoicePayment } from '../invoicing/issue';
import { notifyConfirmed } from '../notify';
import type { getStripe } from './providers';
import {
  refundDuplicatePayment,
  requestBookingRefund,
  submitRefund,
  syncRefundedTotal,
} from './refunds';

// Booking payment state transitions shared by the tRPC routers and the
// Stripe / Cashfree webhooks. Every transition is guarded on the current
// state so webhook retries and out-of-order deliveries are harmless.

type Booking = typeof schema.booking.$inferSelect;

const SETTLED: PaymentStatus[] = ['paid', 'partially_refunded', 'refunded'];

// Releases slots whose checkout hold lapsed. Called before any availability
// check so an abandoned checkout can't block a slot forever.
export async function expireStaleHolds(db: Db, resourceId?: string): Promise<void> {
  const conditions = [
    eq(schema.booking.status, 'pending_payment'),
    lt(schema.booking.holdExpiresAt, new Date()),
  ];
  if (resourceId) conditions.push(eq(schema.booking.resourceId, resourceId));
  await db
    .update(schema.booking)
    .set({ status: 'expired' })
    .where(and(...conditions));
}

export type PaidOutcome = 'confirmed' | 'already_settled' | 'needs_refund' | 'not_found';

// Payment captured. Confirms a held booking; if the hold already lapsed and
// someone else took the slot (or the booking was cancelled meanwhile), the
// booking is marked paid but left unconfirmed so staff can refund it.
export async function markBookingPaid(
  db: Db,
  args: {
    bookingId: string;
    paymentId?: string;
    provider?: 'stripe' | 'cashfree';
    accountId?: string | null;
    vendorId?: string | null;
  },
): Promise<PaidOutcome> {
  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, args.bookingId));
  if (!booking) return 'not_found';
  if (SETTLED.includes(booking.paymentStatus)) {
    if (
      args.paymentId &&
      booking.paymentId &&
      args.paymentId !== booking.paymentId &&
      args.provider &&
      booking.amountCents
    ) {
      await refundDuplicatePayment(db, {
        bookingId: booking.id,
        provider: args.provider,
        paymentId: args.paymentId,
        amountCents: booking.amountCents,
        accountId: args.accountId,
        vendorId: args.vendorId,
      });
    }
    return 'already_settled';
  }

  const payment = {
    paymentStatus: 'paid' as const,
    paidAt: new Date(),
    ...(args.paymentId ? { paymentId: args.paymentId } : {}),
    ...(args.provider
      ? {
          paymentProvider: args.provider,
          paymentAccountId: args.accountId ?? null,
          paymentVendorId: args.vendorId ?? null,
        }
      : {}),
  };
  const notSettled = and(
    eq(schema.booking.id, booking.id),
    inArray(schema.booking.paymentStatus, ['unpaid', 'pending', 'failed']),
  );

  if (booking.status === 'pending_payment' || booking.status === 'expired') {
    try {
      const updated = await db
        .update(schema.booking)
        .set({ ...payment, status: 'confirmed', holdExpiresAt: null })
        .where(and(notSettled, inArray(schema.booking.status, ['pending_payment', 'expired'])))
        .returning({ id: schema.booking.id });
      if (updated.length === 0) {
        const [latest] = await db
          .select()
          .from(schema.booking)
          .where(eq(schema.booking.id, booking.id));
        if (latest && SETTLED.includes(latest.paymentStatus)) return markBookingPaid(db, args);
        return recordUnwantedPayment(db, booking.id, payment);
      }
      await syncInvoicePayment(db, booking.id);
      await notifyConfirmed(db, booking.id);
      return 'confirmed';
    } catch (err) {
      if (!isConflictError(err)) throw err;
      // An expired hold whose slot was re-booked: fall through.
    }
  } else if (booking.status === 'confirmed') {
    // Pay-later link. Guarded on the status too: staff may cancel the
    // booking while the customer is at checkout.
    const updated = await db
      .update(schema.booking)
      .set(payment)
      .where(and(notSettled, eq(schema.booking.status, 'confirmed')))
      .returning({ id: schema.booking.id });
    if (updated.length) {
      await syncInvoicePayment(db, booking.id);
      return 'confirmed';
    }
    const [latest] = await db
      .select()
      .from(schema.booking)
      .where(eq(schema.booking.id, booking.id));
    if (latest && SETTLED.includes(latest.paymentStatus)) return markBookingPaid(db, args);
    return recordUnwantedPayment(db, booking.id, payment);
  }

  console.error(
    `[payments] booking ${booking.id} was paid while ${booking.status}; it needs a refund.`,
  );
  return recordUnwantedPayment(db, booking.id, payment);
}

// Records money that arrived for a booking that no longer wants it. Only the
// delivery that actually flips the payment to paid reports `needs_refund`;
// a concurrent or repeated one sees the settled booking instead.
async function recordUnwantedPayment(
  db: Db,
  bookingId: string,
  payment: Partial<Booking>,
): Promise<PaidOutcome> {
  const updated = await db
    .update(schema.booking)
    .set(payment)
    .where(
      and(
        eq(schema.booking.id, bookingId),
        inArray(schema.booking.paymentStatus, ['unpaid', 'pending', 'failed']),
      ),
    )
    .returning({ id: schema.booking.id });
  return updated.length ? 'needs_refund' : 'already_settled';
}

// A gateway captured a payment (webhook). Marks the booking paid and, when
// this delivery captured money for a booking already cancelled or expired,
// refunds it. Redeliveries for a booking staff have since cancelled (and
// chose to keep the payment) settle as `already_settled` and refund nothing.
export async function capturePayment(
  db: Db,
  args: Parameters<typeof markBookingPaid>[1],
): Promise<{ outcome: PaidOutcome; booking: Booking | undefined }> {
  const outcome = await markBookingPaid(db, args);
  let [latest] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, args.bookingId));
  if (
    outcome === 'needs_refund' &&
    latest &&
    ['cancelled', 'expired'].includes(latest.status) &&
    latest.paymentId === args.paymentId &&
    ['paid', 'partially_refunded'].includes(latest.paymentStatus)
  ) {
    await refundBooking(db, latest);
    [latest] = await db.select().from(schema.booking).where(eq(schema.booking.id, latest.id));
  } else if (outcome === 'already_settled' && latest) {
    // A retried delivery after the gateway timed out on that refund: resume
    // the refund already in flight (never start a new one).
    const unsent = await db
      .select()
      .from(schema.paymentRefund)
      .where(
        and(
          eq(schema.paymentRefund.bookingId, latest.id),
          eq(schema.paymentRefund.status, 'created'),
        ),
      );
    for (const refund of unsent) await submitRefund(db, refund);
  }
  return { outcome, booking: latest };
}

// Checkout failed or was abandoned. `releaseHold` frees the slot right away
// (Stripe session expired) instead of waiting out the hold (a failed card
// attempt the customer can still retry).
export async function markPaymentFailed(
  db: Db,
  args: { bookingId: string; paymentId?: string; releaseHold: boolean },
): Promise<void> {
  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, args.bookingId));
  if (!booking || SETTLED.includes(booking.paymentStatus)) return;
  // An event for an older checkout attempt must not fail the current one.
  if (args.paymentId && booking.paymentId && args.paymentId !== booking.paymentId) return;

  await db
    .update(schema.booking)
    .set({
      paymentStatus: 'failed',
      ...(args.releaseHold && booking.status === 'pending_payment'
        ? { status: 'expired' as const }
        : {}),
    })
    .where(
      and(
        eq(schema.booking.id, booking.id),
        ...(args.paymentId ? [eq(schema.booking.paymentId, args.paymentId)] : []),
        ...(args.releaseHold ? [eq(schema.booking.status, 'pending_payment')] : []),
        inArray(schema.booking.paymentStatus, ['unpaid', 'pending']),
      ),
    );
}

// A gateway reported the booking's cumulative refunded amount. Pass the
// provider's *current* figure (re-fetched, not an event snapshot): it can go
// down when a refund fails, and it only ever adds refunds missing from our
// ledger — see syncRefundedTotal.
export async function recordRefundTotal(
  db: Db,
  args: { bookingId: string; refundedCents: number },
): Promise<void> {
  if (!Number.isSafeInteger(args.refundedCents) || args.refundedCents < 0) return;
  const updated = await db
    .update(schema.booking)
    .set({ refundObservedCents: args.refundedCents })
    .where(
      and(eq(schema.booking.id, args.bookingId), inArray(schema.booking.paymentStatus, SETTLED)),
    )
    .returning({ id: schema.booking.id });
  if (updated.length) await syncRefundedTotal(db, args.bookingId);
}

type StripeClient = NonNullable<ReturnType<typeof getStripe>>;
type StripeReqOpts = { stripeAccount: string } | undefined;

// What to refund: the payment behind a Checkout Session (`cs_…`) or behind a
// paid invoice (`in_…`). Invoices expose it through Invoice Payments (the
// invoice object itself no longer carries `payment_intent`).
export async function stripeRefundTarget(
  stripe: StripeClient,
  paymentId: string,
  reqOpts: StripeReqOpts,
): Promise<{ payment_intent: string } | { charge: string }> {
  if (paymentId.startsWith('in_')) {
    const payments = await stripe.invoicePayments.list(
      { invoice: paymentId, status: 'paid', limit: 1 },
      reqOpts,
    );
    const payment = payments.data[0]?.payment;
    const pi =
      typeof payment?.payment_intent === 'string'
        ? payment.payment_intent
        : payment?.payment_intent?.id;
    if (pi) return { payment_intent: pi };
    const charge = typeof payment?.charge === 'string' ? payment.charge : payment?.charge?.id;
    if (charge) return { charge };
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No payment found on this Stripe invoice.' });
  }
  const session = await stripe.checkout.sessions.retrieve(paymentId, {}, reqOpts);
  const pi =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!pi) throw new TRPCError({ code: 'NOT_FOUND', message: 'Stripe payment missing.' });
  return { payment_intent: pi };
}

// Issues a refund through the gateway that took the payment, against the
// same merchant account. `amountCents` omitted = everything not yet refunded.
export async function refundBooking(db: Db, booking: Booking, amountCents?: number) {
  const refund = await requestBookingRefund(db, booking, amountCents);
  const [latest] = await db.select().from(schema.booking).where(eq(schema.booking.id, booking.id));
  return {
    paymentStatus: latest!.paymentStatus,
    refundedCents: latest!.refundedCents,
    pending: refund.status !== 'succeeded',
    refundId: refund.id,
  };
}
