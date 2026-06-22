-- CreateTable
CREATE TABLE "wetravel_import_jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "contacts_processed" INTEGER NOT NULL DEFAULT 0,
    "contacts_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "failure_details" JSONB,

    CONSTRAINT "wetravel_import_jobs_pkey" PRIMARY KEY ("id")
);
