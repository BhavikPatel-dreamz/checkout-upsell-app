-- CreateTable
CREATE TABLE IF NOT EXISTS "IncrementalityStat" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL DEFAULT '_',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "treatedUsers" INTEGER NOT NULL DEFAULT 0,
    "holdoutUsers" INTEGER NOT NULL DEFAULT 0,
    "treatedOrders" INTEGER NOT NULL DEFAULT 0,
    "holdoutOrders" INTEGER NOT NULL DEFAULT 0,
    "treatedRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "holdoutRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "treatedConversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holdoutConversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "treatedAov" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holdoutAov" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incrementalRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncrementalityStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IncrementalityStat_shop_experimentId_windowStart_key" ON "IncrementalityStat"("shop", "experimentId", "windowStart");
CREATE INDEX IF NOT EXISTS "IncrementalityStat_shop_computedAt_idx" ON "IncrementalityStat"("shop", "computedAt");
