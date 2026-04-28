// 1:1 with `organization` — holds the per-tenant brand + booking template config
// that powers the theme customizer + booking page.

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './org';

export const tenantSettings = pgTable('tenant_settings', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  profession: text('profession').notNull().default('doctor'),
  templateId: text('template_id').notNull().default('doctor'),
  logoText: text('logo_text').notNull().default('UF'),
  accent: text('accent').notNull().default('#0f766e'),
  accentSoft: text('accent_soft').notNull().default('#ccfbf1'),
  accentInk: text('accent_ink').notNull().default('#134e4a'),
  fontDisplay: text('font_display').notNull().default('"Inter", system-ui, sans-serif'),
  fontUi: text('font_ui').notNull().default('"Inter", system-ui, sans-serif'),
  radius: integer('radius').notNull().default(8),
  density: text('density').notNull().default('comfortable'),
  currency: text('currency').notNull().default('USD'),
  onboardingStep: integer('onboarding_step').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
