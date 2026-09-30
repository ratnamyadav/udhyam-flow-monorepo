CREATE TABLE "integration_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"external_account_id" text,
	"external_business_id" text,
	"display_name" text,
	"metadata" jsonb,
	"connected_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"customer_id" text,
	"provider" text NOT NULL,
	"external_id" text,
	"number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"hosted_url" text,
	"document_type" text,
	"taxable_cents" integer,
	"cgst_cents" integer,
	"sgst_cents" integer,
	"igst_cents" integer,
	"gst_rate_bps" integer,
	"sac_code" text,
	"place_of_supply" text,
	"supplier_gstin" text,
	"customer_gstin" text,
	"tax_note" text,
	"issued_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_sequence" (
	"organization_id" text NOT NULL,
	"financial_year" text NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_sequence_organization_id_financial_year_pk" PRIMARY KEY("organization_id","financial_year")
);
--> statement-breakpoint
CREATE TABLE "membership_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"cashfree_payment_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"sessions_per_cycle" integer,
	"active" boolean DEFAULT true NOT NULL,
	"cashfree_plan_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"cashfree_subscription_id" text NOT NULL,
	"cashfree_reference" text,
	"cashfree_session_id" text,
	"status" text DEFAULT 'initialized' NOT NULL,
	"cashfree_status" text,
	"next_charge_at" timestamp,
	"authorized_at" timestamp,
	"cancelled_at" timestamp,
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"gst_threshold_cents" integer,
	"updated_by_user_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payment_vendor_id" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "customer_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "state_code" text;--> statement-breakpoint
ALTER TABLE "resource" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "sac_code" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "gst_rate_bps" integer DEFAULT 1800 NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "gst_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "is_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "cashfree_vendor_id" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "cashfree_vendor_status" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "cashfree_payout_label" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "gst_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "gst_legal_name" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "gst_state_code" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "invoice_prefix" text DEFAULT 'INV' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "gst_threshold_cents" integer;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "invoice_provider" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "auto_invoice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequence" ADD CONSTRAINT "invoice_sequence_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payment" ADD CONSTRAINT "membership_payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payment" ADD CONSTRAINT "membership_payment_subscription_id_membership_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."membership_subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan" ADD CONSTRAINT "membership_plan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_subscription" ADD CONSTRAINT "membership_subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_subscription" ADD CONSTRAINT "membership_subscription_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_subscription" ADD CONSTRAINT "membership_subscription_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connection_org_provider_uniq" ON "integration_connection" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_booking_uniq" ON "invoice" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_payment_cf_id_uniq" ON "membership_payment" USING btree ("cashfree_payment_id");--> statement-breakpoint
CREATE INDEX "membership_payment_subscription_idx" ON "membership_payment" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "membership_plan_org_idx" ON "membership_plan" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_subscription_cf_id_uniq" ON "membership_subscription" USING btree ("cashfree_subscription_id");--> statement-breakpoint
CREATE INDEX "membership_subscription_org_idx" ON "membership_subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "membership_subscription_customer_idx" ON "membership_subscription" USING btree ("customer_id");