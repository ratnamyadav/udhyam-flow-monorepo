import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { location } from './location';
import { organization } from './org';

export const resource = pgTable('resource', {
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
  // Practitioner's personal video room (Google Meet / Zoom / …), https only.
  // Online bookings use it; when unset they get a generated Jitsi room.
  meetingUrl: text('meeting_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
