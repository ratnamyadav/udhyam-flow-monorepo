import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { booking } from './booking';

export const paymentAttempt = pgTable(
  'payment_attempt',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<'stripe' | 'cashfree'>().notNull(),
    accountId: text('account_id'),
    vendorId: text('vendor_id'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    providerPaymentId: text('provider_payment_id'),
    checkoutUrl: text('checkout_url'),
    status: text('status')
      .$type<'creating' | 'open' | 'paid' | 'expired' | 'failed'>()
      .notNull()
      .default('creating'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_attempt_active_booking_uniq')
      .on(t.bookingId)
      .where(sql`status IN ('creating', 'open')`),
    uniqueIndex('payment_attempt_provider_id_uniq').on(t.provider, t.providerPaymentId),
    index('payment_attempt_booking_idx').on(t.bookingId),
    check('payment_attempt_amount_check', sql`${t.amountCents} > 0`),
  ],
);

export const paymentRefund = pgTable(
  'payment_refund',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<'stripe' | 'cashfree'>().notNull(),
    paymentId: text('payment_id').notNull(),
    accountId: text('account_id'),
    vendorId: text('vendor_id'),
    providerRefundId: text('provider_refund_id'),
    kind: text('kind').$type<'booking' | 'duplicate'>().notNull().default('booking'),
    amountCents: integer('amount_cents').notNull(),
    reservationCents: integer('reservation_cents').notNull().default(0),
    status: text('status')
      .$type<'created' | 'pending' | 'succeeded' | 'failed'>()
      .notNull()
      .default('created'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_refund_booking_idx').on(t.bookingId),
    uniqueIndex('payment_refund_provider_id_uniq').on(t.provider, t.providerRefundId),
    uniqueIndex('payment_refund_duplicate_uniq')
      .on(t.provider, t.paymentId)
      .where(sql`kind = 'duplicate'`),
    check('payment_refund_amount_check', sql`${t.amountCents} > 0`),
  ],
);
