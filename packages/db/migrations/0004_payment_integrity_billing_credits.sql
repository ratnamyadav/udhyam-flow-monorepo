CREATE TABLE "billing_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"paid_at" timestamp NOT NULL,
	"paid_until" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"location_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"checkout_id" text,
	"checkout_url" text,
	"status" text DEFAULT 'initializing' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"paid_until" timestamp,
	"last_event_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"session_limit" integer,
	"sessions_used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_usage" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"cycle_id" text NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payment_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"provider" text NOT NULL,
	"account_id" text,
	"vendor_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"provider_payment_id" text,
	"checkout_url" text,
	"status" text DEFAULT 'creating' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempt_amount_check" CHECK ("payment_attempt"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_refund" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"provider" text NOT NULL,
	"payment_id" text NOT NULL,
	"account_id" text,
	"vendor_id" text,
	"provider_refund_id" text,
	"kind" text DEFAULT 'booking' NOT NULL,
	"amount_cents" integer NOT NULL,
	"reservation_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refund_amount_check" CHECK ("payment_refund"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "refund_reserved_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "refund_completed_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "refund_observed_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "refund_baseline_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "service_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_subscription_id_location_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."location_subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_subscription" ADD CONSTRAINT "location_subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_subscription" ADD CONSTRAINT "location_subscription_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_cycle" ADD CONSTRAINT "membership_cycle_subscription_id_membership_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."membership_subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_cycle" ADD CONSTRAINT "membership_cycle_payment_id_membership_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."membership_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_usage" ADD CONSTRAINT "membership_usage_cycle_id_membership_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."membership_cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund" ADD CONSTRAINT "payment_refund_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payment_provider_uniq" ON "billing_payment" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_subscription_current_uniq" ON "location_subscription" USING btree ("location_id") WHERE status NOT IN ('cancelled', 'expired');--> statement-breakpoint
CREATE UNIQUE INDEX "location_subscription_provider_uniq" ON "location_subscription" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "location_subscription_org_idx" ON "location_subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_cycle_payment_uniq" ON "membership_cycle" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "membership_cycle_subscription_idx" ON "membership_cycle" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempt_active_booking_uniq" ON "payment_attempt" USING btree ("booking_id") WHERE status IN ('creating', 'open');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempt_provider_id_uniq" ON "payment_attempt" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "payment_attempt_booking_idx" ON "payment_attempt" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_refund_booking_idx" ON "payment_refund" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refund_provider_id_uniq" ON "payment_refund" USING btree ("provider","provider_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refund_duplicate_uniq" ON "payment_refund" USING btree ("provider","payment_id") WHERE kind = 'duplicate';
--> statement-breakpoint
UPDATE "booking" SET "refund_baseline_cents" = "refunded_cents" WHERE "refunded_cents" <> 0;
