// Blocked time: holidays, leave, a lunch break. A row with a resource blocks
// just that resource; without one it blocks every resource at the location.
// Stored as UTC instants — the API converts the owner's local dates/times
// using the location's timezone.

import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { location } from './location';
import { organization } from './org';
import { resource } from './resource';

export const timeOff = pgTable(
  'time_off',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
    resourceId: text('resource_id').references(() => resource.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('time_off_location_start_idx').on(t.locationId, t.startsAt),
    check('time_off_order_check', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
