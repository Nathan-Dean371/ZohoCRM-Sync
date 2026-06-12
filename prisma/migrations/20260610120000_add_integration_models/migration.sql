CREATE TABLE "integration_config" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'singleton',
    "ventrata_webhook_secret" VARCHAR(255),
    "zoho_refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "token_metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "dlq_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_map" (
    "ventrata_uuid" VARCHAR(100) NOT NULL,
    "zoho_record_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_map_pkey" PRIMARY KEY ("ventrata_uuid")
);

CREATE UNIQUE INDEX "idempotency_map_zoho_record_id_key" ON "idempotency_map"("zoho_record_id");