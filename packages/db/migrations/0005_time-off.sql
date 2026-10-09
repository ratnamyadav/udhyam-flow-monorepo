CREATE TABLE "time_off" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"location_id" text NOT NULL,
	"resource_id" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "time_off_order_check" CHECK ("time_off"."ends_at" > "time_off"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_off_location_start_idx" ON "time_off" USING btree ("location_id","starts_at");