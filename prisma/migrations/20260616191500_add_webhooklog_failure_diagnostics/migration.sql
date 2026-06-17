-- AlterTable
ALTER TABLE "webhook_logs"
ADD COLUMN     "failure_class" VARCHAR(20),
ADD COLUMN     "failure_diagnostics" JSONB;
