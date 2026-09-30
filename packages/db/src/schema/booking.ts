import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { location } from './location';
import { organization } from './org';
import { resource } from './resource';

// Booking lifecycle:
//   pending_payment → confirmed        (payment webhook)
//   pending_payment → expired          (hold lapsed without payment)
//   pending_payment → cancelled
//   confirmed       → cancelled | completed | no_show
export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'expired',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Statuses that occupy a slot. `pending_payment` only blocks while its hold is
// live — expired holds are flipped to `expired` before any conflict check.
export const SLOT_BLOCKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'completed',
  'no_show',
] as const satisfies readonly BookingStatus[];

// Payment lifecycle: `unpaid` (free service, or pay-at-venue when no gateway
// is configured), `pending` (checkout opened, webhook not yet observed),
// `paid`, `partially_refunded`, `refunded`, `failed`. Driven by the Stripe /
// Cashfree webhooks.
export const PAYMENT_STATUSES = [
  'unpaid',
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const booking = pgTable(
  'booking',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // `no action` (not cascade): locations and resources are archived rather
    // than deleted so booking history — and the revenue built on it —
    // survives. Deleting the whole organization still cascades.
    locationId: text('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'no action' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => resource.id, { onDelete: 'no action' }),
    // Nullable + no FK cascade so we keep booking history if the service is
    // later deleted from the catalog.
    serviceId: text('service_id'),
    // Customer FK — also no cascade so canceled customer rows don't nuke
    // booking history. Nullable for the migration window; new bookings always
    // populate it via the upsert in booking.create.
    customerId: text('customer_id'),
    customerName: text('customer_name').notNull(),
    customerEmail: text('customer_email'),
    customerPhone: text('customer_phone'),
    slotStart: timestamp('slot_start').notNull(),
    slotEnd: timestamp('slot_end').notNull(),
    status: text('status').$type<BookingStatus>().notNull().default('confirmed'),
    // When a paid booking is waiting on checkout, the slot is held until
    // this instant. Null for everything else.
    holdExpiresAt: timestamp('hold_expires_at'),
    paymentStatus: text('payment_status').$type<PaymentStatus>().notNull().default('unpaid'),
    paymentProvider: text('payment_provider'),
    // Stripe: Checkout Session id. Cashfree: order id.
    paymentId: text('payment_id'),
    // Which merchant account took the money — the Stripe Connect account id,
    // or `tenant` when the tenant's own Cashfree credentials were used. Null
    // means the platform account. Refunds must go back through the same one.
    paymentAccountId: text('payment_account_id'),
    // Cashfree Easy Split vendor the payment was split to (null = platform
    // settlement). Refunds recover from the same vendor.
    paymentVendorId: text('payment_vendor_id'),
    // Price snapshot at booking time, so later catalog edits don't rewrite
    // what the customer was charged (or past revenue).
    amountCents: integer('amount_cents'),
    currency: text('currency'),
    paidAt: timestamp('paid_at'),
    refundedCents: integer('refunded_cents').notNull().default(0),
    cancelReason: text('cancel_reason'),
    intake: jsonb('intake').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    // WhatsApp/SMS 24h reminder. The reminder cron claims a booking by setting
    // this with a conditional `WHERE reminder_sent_at IS NULL` update before
    // sending, so overlapping cron runs can't double-send.
    reminderSentAt: timestamp('reminder_sent_at'),
    // Set when the customer taps "Confirm" on the WhatsApp reminder. Purely
    // informational (status stays `confirmed`) — shown on the bookings list.
    customerConfirmedAt: timestamp('customer_confirmed_at'),
    // Join link for online services: the resource's own Meet/Zoom room, or a
    // generated Jitsi room. Snapshotted at booking time so later edits to the
    // resource don't change links customers already have.
    meetingUrl: text('meeting_url'),
    // Acquisition channel from `?source=` / `?utm_source=` on the public
    // booking page (e.g. `google`, `instagram`). Sanitized to [a-z0-9_-]{1,32}.
    source: text('source'),
  },
  (t) => [
    index('booking_org_slot_idx').on(t.organizationId, t.slotStart),
    index('booking_resource_slot_idx').on(t.resourceId, t.slotStart),
    index('booking_customer_idx').on(t.customerId),
    // Backstop against two concurrent requests grabbing the same slot. The
    // stronger overlap guard (an exclusion constraint over the time range)
    // lives in migrations/ because drizzle-kit can't express it; see
    // src/constraints.ts.
    uniqueIndex('booking_resource_slot_active_uniq')
      .on(t.resourceId, t.slotStart)
      .where(sql`status IN (${inList(SLOT_BLOCKING_STATUSES)})`),
    check('booking_status_check', sql`${t.status} IN (${inList(BOOKING_STATUSES)})`),
    check('booking_payment_status_check', sql`${t.paymentStatus} IN (${inList(PAYMENT_STATUSES)})`),
    check('booking_slot_order_check', sql`${t.slotEnd} > ${t.slotStart}`),
  ],
);
