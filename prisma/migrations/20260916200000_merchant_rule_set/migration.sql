-- CreateTable
CREATE TABLE "MerchantRuleSet" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "neverProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alwaysProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxN" INTEGER NOT NULL DEFAULT 5,
    "minMarginPercent" DOUBLE PRECISION,
    "priceMin" DECIMAL(12,2),
    "priceMax" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRuleSet_shop_key" ON "MerchantRuleSet"("shop");
