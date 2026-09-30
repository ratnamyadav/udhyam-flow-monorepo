// Platform-wide settings owned by UdyamFlow staff (edited in apps/admin).
// A single row keyed 'global' — stores inherit these unless they set their
// own value in tenant_settings.

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const PLATFORM_SETTINGS_ID = 'global';

export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey(),
  // Default "charge GST only above this amount" (paise) for stores that
  // haven't set their own. null = charge GST on every transaction.
  gstThresholdCents: integer('gst_threshold_cents'),
  updatedByUserId: text('updated_by_user_id'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
