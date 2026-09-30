import { TRPCError } from '@trpc/server';
import { type Db, isConflictError, type PaymentStatus, schema } from '@udyamflow/db';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { cashfreeRefund } from '../cashfree';
import { notifyConfirmed } from '../notify';
import { cashfreeOrderIdFor, getStripe } from './providers';

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
  args: { bookingId: string; paymentId?: string },
): Promise<PaidOutcome> {
  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, args.bookingId));
  if (!booking) return 'not_found';
  if (SETTLED.includes(booking.paymentStatus)) return 'already_settled';

  const payment = {
    paymentStatus: 'paid' as const,
    paidAt: new Date(),
    ...(args.paymentId ? { paymentId: args.paymentId } : {}),
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
        .where(notSettled)
        .returning({ id: schema.booking.id });
      if (updated.length === 0) return 'already_settled';
      await notifyConfirmed(db, booking.id);
      return 'confirmed';
    } catch (err) {
      if (!isConflictError(err)) throw err;
      // An expired hold whose slot was re-booked: fall through.
    }
  } else if (booking.status === 'confirmed') {
    await db.update(schema.booking).set(payment).where(notSettled);
    return 'confirmed';
  }

  await db.update(schema.booking).set(payment).where(notSettled);
  console.error(
    `[payments] booking ${booking.id} was paid while ${booking.status}; it needs a refund.`,
  );
  return 'needs_refund';
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
        inArray(schema.booking.paymentStatus, ['unpaid', 'pending']),
      ),
    );
}

function refundStatusFor(amountCents: number | null, refundedCents: number): PaymentStatus {
  if (amountCents == null || refundedCents >= amountCents) return 'refunded';
  return refundedCents > 0 ? 'partially_refunded' : 'paid';
}

// A gateway reported the booking's cumulative refunded amount (webhook).
// Takes the max so a late or repeated event never lowers what we recorded.
export async function recordRefundTotal(
  db: Db,
  args: { bookingId: string; refundedCents: number },
): Promise<void> {
  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, args.bookingId));
  if (!booking || !SETTLED.includes(booking.paymentStatus)) return;
  const refundedCents = Math.max(booking.refundedCents, args.refundedCents);
  await db
    .update(schema.booking)
    .set({ refundedCents, paymentStatus: refundStatusFor(booking.amountCents, refundedCents) })
    .where(eq(schema.booking.id, booking.id));
}

// Amount the customer paid. Bookings made before price snapshots existed
// fall back to the service's current price.
async function chargedCents(db: Db, booking: Booking): Promise<number | null> {
  if (booking.amountCents != null) return booking.amountCents;
  if (!booking.serviceId) return null;
  const [svc] = await db
    .select({ priceCents: schema.service.priceCents })
    .from(schema.service)
    .where(eq(schema.service.id, booking.serviceId));
  return svc?.priceCents ?? null;
}

type StripeClient = NonNullable<ReturnType<typeof getStripe>>;
type StripeReqOpts = { stripeAccount: string } | undefined;

// The Stripe account a booking's payment lives on. Checkout payments record
// it at checkout time (null = platform). Invoice payments (`in_…`, from
// invoicing) are always issued on the tenant's Connect account; bookings paid
// that way before the account was recorded fall back to the tenant's.
async function stripeAccountForBooking(db: Db, booking: Booking): Promise<string | undefined> {
  if (booking.paymentAccountId?.startsWith('acct_')) return booking.paymentAccountId;
  if (!booking.paymentId?.startsWith('in_')) return undefined;
  const [tenant] = await db
    .select({ accountId: schema.tenantSettings.stripeAccountId })
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, booking.organizationId));
  return tenant?.accountId ?? undefined;
}

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
export async function refundBooking(
  db: Db,
  booking: Booking,
  amountCents?: number,
): Promise<{ paymentStatus: PaymentStatus; refundedCents: number }> {
  if (booking.paymentStatus !== 'paid' && booking.paymentStatus !== 'partially_refunded') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Booking is not paid.' });
  }
  if (!booking.paymentProvider || !booking.paymentId) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No payment record.' });
  }
  const charged = await chargedCents(db, booking);
  if (charged == null) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Unknown payment amount.' });
  }
  const remaining = charged - booking.refundedCents;
  const amount = amountCents ?? remaining;
  if (amount <= 0 || amount > remaining) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Refund must be between 1 and ${remaining} (minor units).`,
    });
  }

  try {
    if (booking.paymentProvider === 'stripe') {
      const stripe = getStripe();
      if (!stripe) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Stripe is not configured.' });
      }
      const account = await stripeAccountForBooking(db, booking);
      const reqOpts = account ? { stripeAccount: account } : undefined;
      const target = await stripeRefundTarget(stripe, booking.paymentId, reqOpts);
      await stripe.refunds.create({ ...target, amount }, reqOpts);
    } else if (booking.paymentProvider === 'cashfree') {
      // Split orders recover the refund from the tenant's vendor share.
      await cashfreeRefund({
        orderId: cashfreeOrderIdFor(booking),
        amountPaise: amount,
        vendorId: booking.paymentVendorId,
      });
    } else {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Unknown payment provider.' });
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: err instanceof Error ? err.message : 'Refund failed at the payment gateway.',
    });
  }

  const refundedCents = booking.refundedCents + amount;
  const paymentStatus = refundStatusFor(charged, refundedCents);
  await db
    .update(schema.booking)
    .set({ refundedCents, paymentStatus })
    .where(eq(schema.booking.id, booking.id));
  return { paymentStatus, refundedCents };
}
