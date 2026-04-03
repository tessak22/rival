-- Make duration_ms NOT NULL with DEFAULT 0 (backfills existing NULLs)
UPDATE "api_logs" SET "duration_ms" = 0 WHERE "duration_ms" IS NULL;
ALTER TABLE "api_logs" ALTER COLUMN "duration_ms" SET NOT NULL;
ALTER TABLE "api_logs" ALTER COLUMN "duration_ms" SET DEFAULT 0;

-- Fix Notification → Scan FK to SET NULL on delete (was NO ACTION)
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_scan_id_fkey";
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_scan_id_fkey"
FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
