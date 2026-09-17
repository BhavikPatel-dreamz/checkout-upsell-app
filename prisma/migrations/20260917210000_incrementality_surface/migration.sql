-- AlterTable
ALTER TABLE "ExperimentAssignment" ADD COLUMN IF NOT EXISTS "surface" TEXT NOT NULL DEFAULT '_';

ALTER TABLE "IncrementalityStat" ADD COLUMN IF NOT EXISTS "surface" TEXT NOT NULL DEFAULT '_';

DROP INDEX IF EXISTS "IncrementalityStat_shop_experimentId_windowStart_key";
CREATE UNIQUE INDEX IF NOT EXISTS "IncrementalityStat_shop_experimentId_surface_windowStart_key" ON "IncrementalityStat"("shop", "experimentId", "surface", "windowStart");
CREATE INDEX IF NOT EXISTS "IncrementalityStat_shop_surface_computedAt_idx" ON "IncrementalityStat"("shop", "surface", "computedAt");
