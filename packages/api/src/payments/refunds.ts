import { createHash, randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, queryRows, schema } from '@udyamflow/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { CashfreeError, cashfreeGetRefund, cashfreeRefund } from '../cashfree';
import { stripeRefundTarget } from './lifecycle';
import { cashfreeOrderIdFor, getStripe } from './providers';

type Refund = typeof schema.paymentRefund.$inferSelect;
type Booking = typeof schema.booking.$inferSelect;

export function refundState(status: string | null | undefined): Refund['status'] {
  if (status === 'succeeded' || status === 'SUCCESS') return 'succeeded';
  if (['failed', 'canceled', 'FAILED', 'CANCELLED', 'REJECTED'].includes(status ?? ''))
    return 'failed';
  return 'pending';
}

// Refunded total = the ledger (legacy baseline + completed refunds), floored
// by what the gateway reports for the charge minus refunds still in flight in
// our ledger. The gateway figure only adds refunds made outside the app
// (e.g. in the Stripe dashboard); it counts pending refunds and drops again
// when one fails, so it never marks a booking refunded on its own.
export async function syncRefundedTotal(db: Db, bookingId: string) {
  const total = sql`greatest(0, b.refund_baseline_cents + b.refund_completed_cents, b.refund_observed_cents - coalesce((SELECT sum(r.amount_cents) FROM payment_refund r WHERE r.booking_id = b.id AND r.kind = 'booking' AND r.status IN ('created', 'pending')), 0))`;
  await db.execute(sql`
    UPDATE booking b SET
      refunded_cents = ${total},
      payment_status = CASE
        WHEN ${total} > 0 AND ${total} >= coalesce(b.amount_cents, 0) THEN 'refunded'
        WHEN ${total} > 0 THEN 'partially_refunded'
        ELSE 'paid' END
    WHERE b.id = ${bookingId} AND b.payment_status IN ('paid', 'partially_refunded', 'refunded')
  `);
}

// One conditional statement claims the transition and applies its delta to
// the booking's counters, so repeated or out-of-order provider events can't
// count the same money twice. Allowed: created|pending → succeeded|failed,
// and succeeded → failed (Stripe can fail a refund after reporting success).
export async function finishRefund(
  db: Db,
  id: string,
  status: Refund['status'],
  providerRefundId?: string,
  error?: string,
) {
  if (status === 'pending') {
    await db
      .update(schema.paymentRefund)
      .set({ status, providerRefundId, updatedAt: new Date() })
      .where(
        and(
          eq(schema.paymentRefund.id, id),
          inArray(schema.paymentRefund.status, ['created', 'pending']),
        ),
      );
    return;
  }
  const [changed] = await queryRows<{ booking_id: string; kind: string }>(
    db,
    sql`
    WITH prev AS (
      SELECT id, booking_id, kind, amount_cents, reservation_cents, status FROM payment_refund
      WHERE id = ${id} FOR UPDATE
    ), finished AS (
      UPDATE payment_refund r SET
        status = ${status},
        provider_refund_id = coalesce(${providerRefundId ?? null}, r.provider_refund_id),
        updated_at = now(),
        error = CASE WHEN ${status} = 'failed' THEN coalesce(${error ?? null}, r.error, 'Refund failed at the gateway.') ELSE NULL END
      FROM prev p
      WHERE r.id = p.id AND (p.status IN ('created', 'pending') OR (p.status = 'succeeded' AND ${status} = 'failed'))
      RETURNING p.booking_id, p.kind, p.amount_cents, p.reservation_cents, p.status AS prev_status
    )
    UPDATE booking b SET
      refund_reserved_cents = greatest(0, b.refund_reserved_cents - CASE WHEN f.prev_status IN ('created', 'pending') THEN f.reservation_cents ELSE 0 END),
      refund_completed_cents = greatest(0, b.refund_completed_cents + CASE
        WHEN f.kind <> 'booking' THEN 0
        WHEN ${status} = 'succeeded' THEN f.amount_cents
        WHEN f.prev_status = 'succeeded' THEN -f.amount_cents
        ELSE 0 END)
    FROM finished f WHERE b.id = f.booking_id
    RETURNING b.id AS booking_id, f.kind
  `,
  );
  if (changed?.kind === 'booking') await syncRefundedTotal(db, changed.booking_id);
}

export async function recordProviderRefund(
  db: Db,
  args: {
    bookingId: string;
    provider: 'stripe' | 'cashfree';
    providerRefundId: string;
    amountCents: number;
    status: string;
    localId?: string;
    paymentId?: string;
  },
) {
  const [known] = await db
    .select()
    .from(schema.paymentRefund)
    .where(
      args.localId
        ? eq(schema.paymentRefund.id, args.localId)
        : and(
            eq(schema.paymentRefund.provider, args.provider),
            eq(schema.paymentRefund.providerRefundId, args.providerRefundId),
          ),
    );
  if (known) {
    if (
      known.bookingId !== args.bookingId ||
      known.provider !== args.provider ||
      known.amountCents !== args.amountCents
    )
      return;
    await finishRefund(db, known.id, refundState(args.status), args.providerRefundId);
    return;
  }
  // Refunds issued in the merchant's dashboard also enter the ledger.
  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, args.bookingId));
  if (!booking || !args.paymentId || booking.paymentId !== args.paymentId) return;
  const id = `rfd_${createHash('sha256').update(`${args.provider}:${args.providerRefundId}`).digest('hex').slice(0, 32)}`;
  await db
    .insert(schema.paymentRefund)
    .values({
      id,
      bookingId: booking.id,
      provider: args.provider,
      paymentId: args.paymentId,
      providerRefundId: args.providerRefundId,
      amountCents: args.amountCents,
    })
    .onConflictDoNothing();
  await finishRefund(db, id, refundState(args.status), args.providerRefundId);
}

// Errors after which the gateway definitely did not create the object
// (validation, card or balance rejections). Network errors, timeouts, 5xx,
// rate limits and idempotency conflicts are ambiguous: the request may have
// gone through, so the caller must keep its key and retry safely.
export function isDefinitiveRejection(err: unknown): boolean {
  if (err instanceof CashfreeError)
    return err.status >= 400 && err.status < 500 && err.status !== 409 && err.status !== 429;
  const e = err as { type?: unknown; statusCode?: unknown } | null;
  if (e?.type !== 'StripeInvalidRequestError' && e?.type !== 'StripeCardError') return false;
  return e.statusCode !== 409 && e.statusCode !== 429;
}

class Rejected extends Error {
  constructor(readonly original: unknown) {
    super(original instanceof Error ? original.message : 'Gateway rejected the refund.');
  }
}

// Sends (or re-checks) one ledger row with its gateway. Safe to call again:
// a row the gateway may already know about is looked up before anything new
// is created, because Stripe forgets idempotency keys after ~24h.
export async function submitRefund(db: Db, refund: Refund) {
  if (refund.status === 'succeeded' || refund.status === 'failed') return refund;
  // Only the create call itself can be a definitive rejection.
  const create = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      throw isDefinitiveRejection(err) ? new Rejected(err) : err;
    }
  };
  try {
    if (refund.provider === 'stripe') {
      const stripe = getStripe();
      if (!stripe)
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Stripe is not configured.' });
      const opts = refund.accountId ? { stripeAccount: refund.accountId } : undefined;
      let response: { id: string; status: string | null } | undefined = refund.providerRefundId
        ? await stripe.refunds.retrieve(refund.providerRefundId, {}, opts)
        : undefined;
      if (!response) {
        const target = await stripeRefundTarget(stripe, refund.paymentId, opts);
        const earlier = await stripe.refunds.list({ ...target, limit: 100 }, opts);
        response = earlier.data.find((r) => r.metadata?.refundId === refund.id);
        response ??= await create(() =>
          stripe.refunds.create(
            {
              ...target,
              amount: refund.amountCents,
              metadata: { bookingId: refund.bookingId, refundId: refund.id },
              ...(refund.kind === 'duplicate' ? { reason: 'duplicate' as const } : {}),
            },
            { ...opts, idempotencyKey: refund.id },
          ),
        );
      }
      await finishRefund(db, refund.id, refundState(response.status), response.id);
    } else {
      // A row that was sent before (or came from the gateway) is looked up
      // first; only a refund Cashfree has never seen is posted.
      const sentBefore = !!refund.providerRefundId || !!refund.error || refund.status === 'pending';
      let response = sentBefore
        ? await cashfreeGetRefund(refund.paymentId, refund.providerRefundId ?? refund.id)
        : null;
      if (!response && refund.providerRefundId && refund.providerRefundId !== refund.id)
        throw new Error('Cashfree has no record of this refund yet.');
      if (!response) {
        try {
          response = await create(() =>
            cashfreeRefund({
              orderId: refund.paymentId,
              amountPaise: refund.amountCents,
              vendorId: refund.vendorId,
              refundId: refund.id,
            }),
          );
        } catch (err) {
          // 409: this refund id already exists — read its state instead.
          if (!(err instanceof CashfreeError && err.status === 409)) throw err;
          response = await cashfreeGetRefund(refund.paymentId, refund.id);
          if (!response) throw err;
        }
      }
      await finishRefund(db, refund.id, refundState(response.status), response.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : 'Gateway error';
    if (err instanceof Rejected) {
      // Nothing was created: fail the row and release its reservation.
      await finishRefund(db, refund.id, 'failed', undefined, message);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `The payment gateway rejected this refund: ${message}`.slice(0, 300),
        cause: err.original,
      });
    }
    // A timeout may have happened after the provider accepted the refund.
    // Keep the reservation and the identifier for safe retries.
    await db
      .update(schema.paymentRefund)
      .set({ error: message, updatedAt: new Date() })
      .where(
        and(
          eq(schema.paymentRefund.id, refund.id),
          inArray(schema.paymentRefund.status, ['created', 'pending']),
        ),
      );
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: 'Refund not yet confirmed. Retry this refund to check it safely.',
      cause: err,
    });
  }
  return (
    await db.select().from(schema.paymentRefund).where(eq(schema.paymentRefund.id, refund.id))
  )[0]!;
}

export async function requestBookingRefund(db: Db, supplied: Booking, amountCents?: number) {
  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, supplied.id));
  if (!booking || !['paid', 'partially_refunded'].includes(booking.paymentStatus)) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Booking is not paid.' });
  }
  if (
    !booking.paymentId ||
    (booking.paymentProvider !== 'stripe' && booking.paymentProvider !== 'cashfree')
  ) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No payment record.' });
  }
  let charged = booking.amountCents;
  if (charged == null && booking.serviceId)
    charged =
      (await db.select().from(schema.service).where(eq(schema.service.id, booking.serviceId)))[0]
        ?.priceCents ?? null;
  if (charged == null)
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Unknown payment amount.' });
  const [pending] = await db
    .select()
    .from(schema.paymentRefund)
    .where(
      and(
        eq(schema.paymentRefund.bookingId, booking.id),
        eq(schema.paymentRefund.kind, 'booking'),
        inArray(schema.paymentRefund.status, ['created', 'pending']),
      ),
    );
  // A full refund covers whatever is neither refunded nor already in flight.
  const remaining = charged - booking.refundedCents - booking.refundReservedCents;
  // Same request again (double click, webhook redelivery): reuse the row in
  // flight instead of reserving more.
  if (
    pending &&
    (amountCents === undefined ? remaining <= 0 : amountCents === pending.amountCents)
  ) {
    return pending.status === 'created' ? submitRefund(db, pending) : pending;
  }
  const amount = amountCents ?? remaining;
  if (amount <= 0 || !Number.isSafeInteger(amount))
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        amountCents === undefined ? 'Nothing left to refund.' : 'Enter a positive refund amount.',
    });
  const id = `rfd_${randomUUID().replace(/-/g, '')}`;
  let accountId = booking.paymentAccountId;
  if (booking.paymentProvider === 'stripe' && booking.paymentId.startsWith('in_') && !accountId) {
    accountId =
      (
        await db
          .select()
          .from(schema.tenantSettings)
          .where(eq(schema.tenantSettings.organizationId, booking.organizationId))
      )[0]?.stripeAccountId ?? null;
  }
  const inserted = await queryRows<{ id: string }>(
    db,
    sql`
    WITH reserved AS (
      UPDATE booking SET refund_reserved_cents = refund_reserved_cents + ${amount}, amount_cents = coalesce(amount_cents, ${charged})
      WHERE id = ${booking.id} AND payment_status IN ('paid', 'partially_refunded')
        AND ${amount} <= coalesce(amount_cents, ${charged}) - refunded_cents - refund_reserved_cents
      RETURNING id
    )
    INSERT INTO payment_refund (id, booking_id, provider, payment_id, account_id, vendor_id, amount_cents, reservation_cents)
    SELECT ${id}, id, ${booking.paymentProvider}, ${booking.paymentProvider === 'cashfree' ? cashfreeOrderIdFor(booking) : booking.paymentId}, ${accountId}, ${booking.paymentVendorId}, ${amount}, ${amount} FROM reserved
    RETURNING id
  `,
  );
  if (!inserted.length && amountCents === undefined) {
    // A concurrent full refund reserved the balance first: report that one.
    const [raced] = await db
      .select()
      .from(schema.paymentRefund)
      .where(
        and(
          eq(schema.paymentRefund.bookingId, booking.id),
          eq(schema.paymentRefund.kind, 'booking'),
          inArray(schema.paymentRefund.status, ['created', 'pending']),
        ),
      );
    if (raced) return raced;
  }
  if (!inserted.length)
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Refund exceeds the remaining balance or another refund is pending.',
    });
  const refund = (
    await db.select().from(schema.paymentRefund).where(eq(schema.paymentRefund.id, id))
  )[0]!;
  return submitRefund(db, refund);
}

export async function refundDuplicatePayment(
  db: Db,
  args: {
    bookingId: string;
    provider: 'stripe' | 'cashfree';
    paymentId: string;
    amountCents: number;
    accountId?: string | null;
    vendorId?: string | null;
  },
) {
  const id = `rfd_${createHash('sha256').update(`duplicate:${args.provider}:${args.paymentId}`).digest('hex').slice(0, 32)}`;
  await db
    .insert(schema.paymentRefund)
    .values({ id, ...args, kind: 'duplicate' })
    .onConflictDoNothing();
  const refund = (
    await db.select().from(schema.paymentRefund).where(eq(schema.paymentRefund.id, id))
  )[0]!;
  return submitRefund(db, refund);
}
