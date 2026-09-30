CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"location_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"service_id" text,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"slot_start" timestamp NOT NULL,
	"slot_end" timestamp NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"hold_expires_at" timestamp,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_provider" text,
	"payment_id" text,
	"payment_account_id" text,
	"amount_cents" integer,
	"currency" text,
	"paid_at" timestamp,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"cancel_reason" text,
	"intake" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_status_check" CHECK ("booking"."status" IN ('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show', 'expired')),
	CONSTRAINT "booking_payment_status_check" CHECK ("booking"."payment_status" IN ('unpaid', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed')),
	CONSTRAINT "booking_slot_order_check" CHECK ("booking"."slot_end" > "booking"."slot_start")
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"last_booking_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_user_org_unique" UNIQUE("user_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "resource" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"avatar" text,
	"profession_meta" jsonb,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_hours" (
	"resource_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_min" integer NOT NULL,
	"close_min" integer NOT NULL,
	CONSTRAINT "resource_hours_resource_id_day_of_week_pk" PRIMARY KEY("resource_id","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_resource" (
	"service_id" text NOT NULL,
	"resource_id" text NOT NULL,
	CONSTRAINT "service_resource_service_id_resource_id_pk" PRIMARY KEY("service_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"profession" text DEFAULT 'doctor' NOT NULL,
	"template_id" text DEFAULT 'doctor' NOT NULL,
	"logo_text" text DEFAULT 'UF' NOT NULL,
	"logo_url" text,
	"accent" text DEFAULT '#0f766e' NOT NULL,
	"accent_soft" text DEFAULT '#ccfbf1' NOT NULL,
	"accent_ink" text DEFAULT '#134e4a' NOT NULL,
	"font_display" text DEFAULT '"Inter", system-ui, sans-serif' NOT NULL,
	"font_ui" text DEFAULT '"Inter", system-ui, sans-serif' NOT NULL,
	"radius" integer DEFAULT 8 NOT NULL,
	"density" text DEFAULT 'comfortable' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"enable_sms" boolean DEFAULT false NOT NULL,
	"enable_whatsapp" boolean DEFAULT false NOT NULL,
	"stripe_account_id" text,
	"stripe_charges_enabled" boolean DEFAULT false NOT NULL,
	"cashfree_merchant_id" text,
	"cashfree_api_key" text,
	"onboarding_step" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_hours" ADD CONSTRAINT "resource_hours_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_resource" ADD CONSTRAINT "service_resource_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_resource" ADD CONSTRAINT "service_resource_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_org_slot_idx" ON "booking" USING btree ("organization_id","slot_start");--> statement-breakpoint
CREATE INDEX "booking_resource_slot_idx" ON "booking" USING btree ("resource_id","slot_start");--> statement-breakpoint
CREATE INDEX "booking_customer_idx" ON "booking" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_resource_slot_active_uniq" ON "booking" USING btree ("resource_id","slot_start") WHERE status IN ('pending_payment', 'confirmed', 'completed', 'no_show');--> statement-breakpoint
CREATE UNIQUE INDEX "customer_org_email_uniq" ON "customer" USING btree ("organization_id","email") WHERE email IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_org_phone_uniq" ON "customer" USING btree ("organization_id","phone") WHERE phone IS NOT NULL;--> statement-breakpoint
CREATE INDEX "location_org_idx" ON "location" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_org_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "resource_org_idx" ON "resource" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "service_org_idx" ON "service" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_settings_stripe_account_uniq" ON "tenant_settings" USING btree ("stripe_account_id");