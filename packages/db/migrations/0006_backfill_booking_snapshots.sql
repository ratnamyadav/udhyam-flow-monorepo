-- Freeze the invoice facts of bookings made before price/service snapshots
-- existed, so later catalog edits stop changing what they invoice for.
-- Uses the catalog as it stands when this migration runs.
UPDATE "booking" AS b
SET
	"amount_cents" = COALESCE(b."amount_cents", s."price_cents"),
	"currency" = COALESCE(b."currency", s."currency"),
	"service_snapshot" = COALESCE(
		b."service_snapshot",
		jsonb_build_object(
			'name', s."name",
			'gstRateBps', s."gst_rate_bps",
			'gstExempt', s."gst_exempt",
			'sacCode', s."sac_code"
		)
	)
FROM "service" AS s
WHERE b."service_id" = s."id"
	AND (b."amount_cents" IS NULL OR b."currency" IS NULL OR b."service_snapshot" IS NULL);
