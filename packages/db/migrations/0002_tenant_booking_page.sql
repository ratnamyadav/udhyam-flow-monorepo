ALTER TABLE "tenant_settings" ALTER COLUMN "font_display" SET DEFAULT 'inter';--> statement-breakpoint
ALTER TABLE "tenant_settings" ALTER COLUMN "font_ui" SET DEFAULT 'inter';--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "booking_layout" text DEFAULT 'sidebar' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "booking_headline" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "booking_intro" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_booking_layout_check" CHECK ("tenant_settings"."booking_layout" IN ('sidebar', 'stacked', 'inline'));