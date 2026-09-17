-- Resume catalog sync across requests (schema field was never migrated).
ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "cursor" TEXT;
