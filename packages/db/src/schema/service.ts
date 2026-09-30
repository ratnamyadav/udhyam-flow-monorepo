// Bookable services. Each tenant defines their own catalog (e.g. "30-min
// new patient", "60-min deep tissue"). A booking is for one service; a
// service can be offered by multiple resources via the join table.

import { boolean, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './org';
import { resource } from './resource';

export const service = pgTable('service', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  durationMin: integer('duration_min').notNull().default(30),
  priceCents: integer('price_cents').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  // Online session (video call) — bookings get a meeting link instead of
  // relying on the location address.
  isOnline: boolean('is_online').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const serviceResource = pgTable(
  'service_resource',
  {
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => resource.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.resourceId] })],
);
