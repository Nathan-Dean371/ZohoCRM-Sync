-- Legacy ventrata_uuid PK is superseded by the generic source_id/source_type pair; every
-- insert since the multi-source cutover has been failing its NOT NULL constraint.
ALTER TABLE "idempotency_map" DROP CONSTRAINT IF EXISTS "idempotency_map_pkey";
ALTER TABLE "idempotency_map" DROP COLUMN IF EXISTS "ventrata_uuid";
ALTER TABLE "idempotency_map" ADD CONSTRAINT "idempotency_map_pkey" PRIMARY KEY USING INDEX "idempotency_map_source_id_source_type_key";
