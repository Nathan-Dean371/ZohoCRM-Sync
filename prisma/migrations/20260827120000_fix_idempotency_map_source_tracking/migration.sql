-- Backfill the newer idempotency_map schema fields from the legacy ventrata_uuid table
ALTER TABLE "idempotency_map"
    ADD COLUMN IF NOT EXISTS "source_id" VARCHAR(100),
    ADD COLUMN IF NOT EXISTS "source_type" VARCHAR(50),
    ADD COLUMN IF NOT EXISTS "record_type" VARCHAR(20);

UPDATE "idempotency_map"
SET "source_id" = "ventrata_uuid"
WHERE "source_id" IS NULL;

UPDATE "idempotency_map"
SET "source_type" = 'ventrata'
WHERE "source_type" IS NULL;

UPDATE "idempotency_map"
SET "record_type" = 'booking'
WHERE "record_type" IS NULL;

ALTER TABLE "idempotency_map"
    ALTER COLUMN "source_id" SET NOT NULL,
    ALTER COLUMN "source_type" SET NOT NULL,
    ALTER COLUMN "record_type" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_map_source_id_source_type_key"
    ON "idempotency_map"("source_id", "source_type");

CREATE INDEX IF NOT EXISTS "idempotency_map_zoho_record_id_idx"
    ON "idempotency_map"("zoho_record_id");
