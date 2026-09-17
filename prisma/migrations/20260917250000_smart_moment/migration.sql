-- AlterTable
CREATE TABLE IF NOT EXISTS "SmartMoment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'detected',
    "productId" TEXT NOT NULL,
    "relatedProductId" TEXT NOT NULL,
    "support" INTEGER NOT NULL DEFAULT 0,
    "lift" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "explanation" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT,
    "offerId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartMoment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmartMoment_shop_kind_productId_relatedProductId_key" ON "SmartMoment"("shop", "kind", "productId", "relatedProductId");
CREATE INDEX IF NOT EXISTS "SmartMoment_shop_status_expectedImpact_idx" ON "SmartMoment"("shop", "status", "expectedImpact");
