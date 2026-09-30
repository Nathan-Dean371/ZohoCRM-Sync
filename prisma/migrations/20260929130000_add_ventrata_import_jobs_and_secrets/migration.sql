-- Add Ventrata secret encryption fields to integration_config
ALTER TABLE "integration_config" ADD COLUMN IF NOT EXISTS "ventrata_secret_iv" VARCHAR(64);
ALTER TABLE "integration_config" ADD COLUMN IF NOT EXISTS "ventrata_secret_auth_tag" VARCHAR(64);
ALTER TABLE "integration_config" ADD COLUMN IF NOT EXISTS "ventrata_secret_algorithm" VARCHAR(20) DEFAULT 'aes-256-gcm';

-- Add source_updated_at to idempotency_map
ALTER TABLE "idempotency_map" ADD COLUMN IF NOT EXISTS "source_updated_at" TIMESTAMPTZ(6);

-- Create Table ventrata_import_jobs
CREATE TABLE IF NOT EXISTS "ventrata_import_jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "travel_date_start" TIMESTAMPTZ(6) NOT NULL,
    "travel_date_end" TIMESTAMPTZ(6) NOT NULL,
    "current_page" INTEGER NOT NULL DEFAULT 1,
    "bookings_processed" INTEGER NOT NULL DEFAULT 0,
    "bookings_failed" INTEGER NOT NULL DEFAULT 0,
    "missing_contact_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "failure_details" JSONB,

    CONSTRAINT "ventrata_import_jobs_pkey" PRIMARY KEY ("id")
);
