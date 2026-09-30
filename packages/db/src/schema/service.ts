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
  // GST: SAC code for the service and its rate in basis points (1800 =
  // 18%). Prices are tax-inclusive — the invoice backs the tax out of
  // priceCents so it always totals what the customer paid.
  sacCode: text('sac_code'),
  gstRateBps: integer('gst_rate_bps').notNull().default(1800),
  // Exempt services (e.g. healthcare by a clinical establishment) go on a
  // Bill of Supply with no tax.
  gstExempt: boolean('gst_exempt').notNull().default(false),
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
