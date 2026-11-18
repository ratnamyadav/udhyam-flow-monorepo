CREATE TABLE "membership_plan_service" (
	"plan_id" text NOT NULL,
	"service_id" text NOT NULL,
	"organization_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" DROP CONSTRAINT "booking_payment_status_check";--> statement-breakpoint
ALTER TABLE "membership_plan_service" ADD CONSTRAINT "membership_plan_service_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_service" ADD CONSTRAINT "membership_plan_service_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_service" ADD CONSTRAINT "membership_plan_service_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_service_uniq" ON "membership_plan_service" USING btree ("plan_id","service_id");--> statement-breakpoint
CREATE INDEX "membership_plan_service_service_idx" ON "membership_plan_service" USING btree ("service_id");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_payment_status_check" CHECK ("booking"."payment_status" IN ('unpaid', 'covered', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed'));