import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, schema } from '@udyamflow/db';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { CashfreeError, cashfreeCreateOrder, cashfreeGetOrder } from '../cashfree';
import {
  APP_URL,
  CHECKOUT_SESSION_MINUTES,
  cashfreeOrderIdFor,
  cashfreeVendorFor,
  getStripe,
  HOLD_MINUTES,
  MAX_HOLD_MINUTES,
  pickProvider,
  stripeConnectAccountFor,
} from './providers';
import { isDefinitiveRejection } from './refunds';

type Booking = typeof schema.booking.$inferSelect;

// A gateway that definitively rejected the create (bad request, not a
// timeout) would replay the same error for this attempt's idempotency key,
// so the attempt is retired: the next checkout opens a fresh attempt with a
// new key. Ambiguous errors keep the attempt so a retry can't create twice.
async function failAttemptOnRejection<T>(db: Db, attemptId: string, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    // Cashfree 409 = the order already exists; the caller adopts it.
    if (isDefinitiveRejection(err))
      await db
        .update(schema.paymentAttempt)
        .set({ status: 'failed' })
        .where(
          and(
            eq(schema.paymentAttempt.id, attemptId),
            eq(schema.paymentAttempt.status, 'creating'),
          ),
        );
    throw err;
  }
}
export async function openBookingCheckout(
  db: Db,
  booking: Booking,
  orgSlug: string,
  serviceName: string | null,
) {
  const provider = pickProvider(booking.currency!);
  if (provider === 'none')
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'No payment provider configured for this currency.',
    });
  await db
    .update(schema.paymentAttempt)
    .set({ status: 'expired' })
    .where(
      and(
        eq(schema.paymentAttempt.bookingId, booking.id),
        inArray(schema.paymentAttempt.status, ['creating', 'open']),
        lt(schema.paymentAttempt.expiresAt, new Date()),
      ),
    );
  let [attempt] = await db
    .select()
    .from(schema.paymentAttempt)
    .where(
      and(
        eq(schema.paymentAttempt.bookingId, booking.id),
        inArray(schema.paymentAttempt.status, ['creating', 'open']),
      ),
    );
  // Adopt older live checkouts before creating anything new.
  if (!attempt && booking.paymentProvider === 'stripe' && booking.paymentId?.startsWith('cs_')) {
    const stripe = getStripe();
    if (stripe) {
      const existing = await stripe.checkout.sessions.retrieve(
        booking.paymentId,
        {},
        booking.paymentAccountId ? { stripeAccount: booking.paymentAccountId } : undefined,
      );
      if (existing.status === 'open' && existing.url) return { redirectUrl: existing.url };
      if (existing.payment_status === 'paid' || existing.status === 'complete')
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Payment is processing. Check the booking confirmation.',
        });
    }
  }
  if (!attempt && booking.paymentProvider === 'cashfree' && booking.paymentId) {
    const existing = await cashfreeGetOrder(cashfreeOrderIdFor(booking));
    if (existing.order_status === 'PAID')
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Payment is processing. Check the booking confirmation.',
      });
    if (existing.order_status === 'ACTIVE')
      return {
        redirectUrl: `${APP_URL}/checkout/cashfree?session=${encodeURIComponent(existing.payment_session_id)}`,
      };
  }
  if (
    !attempt &&
    booking.status === 'pending_payment' &&
    Date.now() + CHECKOUT_SESSION_MINUTES * 60_000 >
      booking.createdAt.getTime() + MAX_HOLD_MINUTES * 60_000
  ) {
    // A new attempt would stretch the hold past its ceiling. Release the slot
    // instead; the customer can pick a time again.
    await db
      .update(schema.booking)
      .set({ status: 'expired' })
      .where(
        and(
          eq(schema.booking.id, booking.id),
          eq(schema.booking.status, 'pending_payment'),
          inArray(schema.booking.paymentStatus, ['unpaid', 'pending', 'failed']),
        ),
      );
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Your hold on this slot expired — please book again.',
    });
  }
  if (!attempt) {
    const accountId =
      provider === 'stripe' ? await stripeConnectAccountFor(db, booking.organizationId) : undefined;
    const vendorId =
      provider === 'cashfree' ? await cashfreeVendorFor(db, booking.organizationId) : undefined;
    if (provider === 'cashfree' && !vendorId && process.env.CASHFREE_REQUIRE_VENDOR === 'true') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'This business has not finished setting up online payments yet.',
      });
    }
    await db
      .insert(schema.paymentAttempt)
      .values({
        id: `pmt_${randomUUID()}`,
        bookingId: booking.id,
        provider,
        accountId,
        vendorId,
        amountCents: booking.amountCents!,
        currency: booking.currency!,
        expiresAt: new Date(Date.now() + CHECKOUT_SESSION_MINUTES * 60_000),
      })
      .onConflictDoNothing();
    [attempt] = await db
      .select()
      .from(schema.paymentAttempt)
      .where(
        and(
          eq(schema.paymentAttempt.bookingId, booking.id),
          inArray(schema.paymentAttempt.status, ['creating', 'open']),
        ),
      );
  }
  if (!attempt)
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Checkout is being updated. Please try again.',
    });
  if (attempt.checkoutUrl) return { redirectUrl: attempt.checkoutUrl };
  const returnUrl = `${APP_URL}/book/${encodeURIComponent(orgSlug)}/confirmation?booking=${encodeURIComponent(booking.id)}`;
  let paymentId: string;
  let checkoutUrl: string;
  if (attempt.provider === 'stripe') {
    const stripe = getStripe();
    if (!stripe)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Stripe is not configured.' });
    const [settings] = await db
      .select()
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, booking.organizationId));
    const metadata = {
      bookingId: booking.id,
      organizationId: booking.organizationId,
      attemptId: attempt.id,
    };
    const session = await failAttemptOnRejection(db, attempt.id, () =>
      stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: attempt.currency.toLowerCase(),
                unit_amount: attempt.amountCents,
                product_data: { name: serviceName ?? 'Booking' },
              },
            },
          ],
          customer_email: booking.customerEmail ?? undefined,
          metadata,
          payment_intent_data: { metadata },
          ...(attempt.accountId && settings?.invoiceProvider === 'stripe' && settings.autoInvoice
            ? { invoice_creation: { enabled: true, invoice_data: { metadata } } }
            : {}),
          expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
          success_url: `${returnUrl}&status=paid`,
          cancel_url: `${returnUrl}&status=cancelled`,
        },
        {
          ...(attempt.accountId ? { stripeAccount: attempt.accountId } : {}),
          idempotencyKey: attempt.id,
        },
      ),
    );
    if (!session.url)
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Checkout unavailable. Please retry.' });
    paymentId = session.id;
    checkoutUrl = session.url;
  } else {
    paymentId = attempt.id;
    let paymentSessionId: string;
    try {
      ({ paymentSessionId } = await failAttemptOnRejection(db, attempt.id, () =>
        cashfreeCreateOrder({
          orderId: attempt.id,
          amountPaise: attempt.amountCents,
          currency: attempt.currency,
          customerId: booking.customerId ?? booking.id,
          customerName: booking.customerName,
          customerEmail: booking.customerEmail ?? undefined,
          customerPhone: booking.customerPhone ?? undefined,
          vendorId: attempt.vendorId ?? undefined,
          expiresAt: attempt.expiresAt,
          returnUrl,
          idempotencyKey: attempt.id.slice(4),
        }),
      ));
    } catch (err) {
      if (!(err instanceof CashfreeError) || err.status !== 409) throw err;
      const existing = await cashfreeGetOrder(attempt.id);
      if (
        Math.round(existing.order_amount * 100) !== attempt.amountCents ||
        existing.order_currency !== attempt.currency
      )
        throw err;
      paymentSessionId = existing.payment_session_id;
    }
    checkoutUrl = `${APP_URL}/checkout/cashfree?session=${encodeURIComponent(paymentSessionId)}`;
  }
  await db
    .update(schema.paymentAttempt)
    .set({ providerPaymentId: paymentId, checkoutUrl, status: 'open' })
    .where(
      and(
        eq(schema.paymentAttempt.id, attempt.id),
        inArray(schema.paymentAttempt.status, ['creating', 'open']),
      ),
    );
  const updated = await db
    .update(schema.booking)
    .set({
      paymentStatus: 'pending',
      paymentProvider: attempt.provider,
      paymentId,
      paymentAccountId: attempt.accountId,
      paymentVendorId: attempt.vendorId,
      ...(booking.status === 'pending_payment'
        ? {
            holdExpiresAt: new Date(
              attempt.expiresAt.getTime() + (HOLD_MINUTES - CHECKOUT_SESSION_MINUTES) * 60_000,
            ),
          }
        : {}),
    })
    .where(
      and(
        eq(schema.booking.id, booking.id),
        inArray(schema.booking.paymentStatus, ['unpaid', 'pending', 'failed']),
        inArray(schema.booking.status, ['pending_payment', 'confirmed']),
      ),
    )
    .returning({ id: schema.booking.id });
  if (!updated.length)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This booking was updated. Check its confirmation before paying.',
    });
  return { redirectUrl: checkoutUrl };
}
