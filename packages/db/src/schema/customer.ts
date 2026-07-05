// Per-tenant customer record. Bookings link here via booking.customer_id
// (added separately in booking.ts). We dedupe at booking time by (orgId,
// email) or (orgId, phone), so the same person doesn't get two rows after
// repeated bookings.

import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './org';

export const customer = pgTable(
  'customer',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    lastBookingAt: timestamp('last_booking_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Partial unique indexes — multiple rows can have null email or null
    // phone, but a given email/phone combo can only repeat across orgs.
    uniqueIndex('customer_org_email_uniq')
      .on(t.organizationId, t.email)
      .where(sql`email IS NOT NULL`),
    uniqueIndex('customer_org_phone_uniq')
      .on(t.organizationId, t.phone)
      .where(sql`phone IS NOT NULL`),
  ],
);
