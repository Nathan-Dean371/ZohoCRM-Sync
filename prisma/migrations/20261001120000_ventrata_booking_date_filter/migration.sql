ALTER TABLE "ventrata_import_jobs"
    RENAME COLUMN "travel_date_start" TO "booking_date_start";

ALTER TABLE "ventrata_import_jobs"
    RENAME COLUMN "travel_date_end" TO "booking_date_end";