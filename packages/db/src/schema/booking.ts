import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { location } from './location';
import { organization } from './org';
import { resource } from './resource';

export const booking = pgTable('booking', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  locationId: text('location_id')
    .notNull()
    .references(() => location.id, { onDelete: 'cascade' }),
  resourceId: text('resource_id')
    .notNull()
    .references(() => resource.id, { onDelete: 'cascade' }),
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
  status: text('status').notNull().default('confirmed'),
  // Payment lifecycle: `unpaid` (free service or no provider configured),
  // `pending` (checkout opened, webhook not yet observed), `paid`, `refunded`,
  // `failed`. Driven by the Stripe / Cashfree webhooks.
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  paymentProvider: text('payment_provider'),
  paymentId: text('payment_id'),
  // Cashfree Easy Split vendor the payment was split to (null = platform
  // settlement). Refunds recover from the same vendor.
  paymentVendorId: text('payment_vendor_id'),
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
});
