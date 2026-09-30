-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "id" INTEGER NOT NULL,
    "shop" TEXT NOT NULL,
    "chargeId" TEXT,
    "name" TEXT,
    "price" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "chargedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreBillingOffer" (
    "shop" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "trialDays" INTEGER NOT NULL DEFAULT 15,
    "legacySubscriber" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreBillingOffer_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE INDEX "SubscriptionHistory_shop_chargedAt_idx" ON "SubscriptionHistory"("shop", "chargedAt");
