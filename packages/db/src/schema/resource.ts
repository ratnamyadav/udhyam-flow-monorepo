import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { location } from './location';
import { organization } from './org';

export const resource = pgTable(
  'resource',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    title: text('title'),
    avatar: text('avatar'),
    professionMeta: jsonb('profession_meta').$type<Record<string, unknown>>(),
    // Soft delete — bookings keep pointing at archived resources.
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('resource_org_idx').on(t.organizationId)],
);
