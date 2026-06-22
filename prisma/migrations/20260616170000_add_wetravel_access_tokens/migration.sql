-- AlterTable
ALTER TABLE "integration_config" ADD COLUMN     "wetravel_access_token" TEXT,
ADD COLUMN     "wetravel_access_token_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "wetravel_token_metadata" JSONB;