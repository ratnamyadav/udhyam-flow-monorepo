// Constraints drizzle-kit can't express. Applied by the custom migration in
// migrations/ (for `db:migrate`) and by `db:constraints` after `db:push`.
// Every statement is idempotent.

// No two slot-occupying bookings for the same resource may overlap in time.
// This is the real double-booking guard: the application-level check in
// booking.create can race, this can't. Requires btree_gist for the `=`
// operator on text inside a GiST index.
export const CONSTRAINTS_SQL = [
  'CREATE EXTENSION IF NOT EXISTS btree_gist',
  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_no_overlap') THEN
    ALTER TABLE "booking" ADD CONSTRAINT "booking_no_overlap"
      EXCLUDE USING gist (
        "resource_id" WITH =,
        tsrange("slot_start", "slot_end", '[)') WITH &&
      )
      WHERE ("status" IN ('pending_payment', 'confirmed', 'completed', 'no_show'));
  END IF;
END $$`,
];
