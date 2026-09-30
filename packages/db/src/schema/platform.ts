// Platform-wide settings owned by UdyamFlow staff (edited in apps/admin).
// A single row keyed 'global' — stores inherit these unless they set their
// own value in tenant_settings.

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const PLATFORM_SETTINGS_ID = 'global';

export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey(),
  // Default GST registration turnover limit for services (paise) for
  // stores without their own. null = the statutory ₹20 lakh.
  gstTurnoverLimitCents: integer('gst_turnover_limit_cents'),
  updatedByUserId: text('updated_by_user_id'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
