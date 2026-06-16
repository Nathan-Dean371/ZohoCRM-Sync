-- AlterTable
ALTER TABLE "integration_config" ADD COLUMN     "wetravel_encrypted_key" VARCHAR(500),
ADD COLUMN     "wetravel_key_algorithm" VARCHAR(20) DEFAULT 'aes-256-gcm',
ADD COLUMN     "wetravel_key_auth_tag" VARCHAR(64),
ADD COLUMN     "wetravel_key_iv" VARCHAR(64),
ADD COLUMN     "wetravel_org_id" VARCHAR(100),
ADD COLUMN     "wetravel_status" VARCHAR(20),
ADD COLUMN     "wetravel_status_error" TEXT;
