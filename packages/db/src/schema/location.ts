import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './org';

export const location = pgTable('location', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  currency: text('currency').notNull().default('INR'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
