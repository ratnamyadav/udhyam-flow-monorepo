// Weekly working hours per resource. Days are stored separately so a resource
// can be open Tuesday and closed Wednesday with no NULL juggling. Times are
// minutes-from-midnight in the location's timezone — the booking router does
// the timezone math.

import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { resource } from './resource';

export const resourceHours = pgTable(
  'resource_hours',
  {
    resourceId: text('resource_id')
      .notNull()
      .references(() => resource.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(), // 0=Sun … 6=Sat (JS Date.getDay)
    openMin: integer('open_min').notNull(), // 0..1440
    closeMin: integer('close_min').notNull(),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.dayOfWeek] })],
);
