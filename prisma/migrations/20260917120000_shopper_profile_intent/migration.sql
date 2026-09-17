-- CreateEnum
CREATE TYPE "ShopperIntentState" AS ENUM ('EXPLORING', 'RESEARCHING', 'COMPARING', 'HIGH_INTENT', 'READY_TO_BUY', 'ABANDONING', 'RETURNING', 'LOYAL');

-- CreateTable
CREATE TABLE "ShopperProfile" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "intentState" "ShopperIntentState" NOT NULL DEFAULT 'EXPLORING',
    "purchaseIntent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productInterest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceSensitivity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountSensitivity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "crossSellPotential" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "abandonRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recentProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchasedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopperProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopperIntentSnapshot" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "intentState" "ShopperIntentState" NOT NULL,
    "purchaseIntent" DOUBLE PRECISION NOT NULL,
    "abandonRisk" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopperIntentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopperProfile_shop_subjectType_subjectId_key" ON "ShopperProfile"("shop", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ShopperProfile_shop_intentState_idx" ON "ShopperProfile"("shop", "intentState");

-- CreateIndex
CREATE INDEX "ShopperIntentSnapshot_shop_subjectId_recordedAt_idx" ON "ShopperIntentSnapshot"("shop", "subjectId", "recordedAt");
