-- AlterTable
ALTER TABLE "wetravel_import_jobs" ADD COLUMN     "bookings_failed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bookings_processed" INTEGER NOT NULL DEFAULT 0;
