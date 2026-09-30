-- Overlap guard drizzle-kit can't express. Keep in sync with src/constraints.ts.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist (
    "resource_id" WITH =,
    tsrange("slot_start", "slot_end", '[)') WITH &&
  )
  WHERE ("status" IN ('pending_payment', 'confirmed', 'completed', 'no_show'));
