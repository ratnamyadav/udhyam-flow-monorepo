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
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone'),
  slotStart: timestamp('slot_start').notNull(),
  slotEnd: timestamp('slot_end').notNull(),
  status: text('status').notNull().default('confirmed'),
  intake: jsonb('intake').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
