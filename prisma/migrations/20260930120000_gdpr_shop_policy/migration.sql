-- CreateTable
CREATE TABLE "ShopDataPolicy" (
    "shop" TEXT NOT NULL,
    "dataStorageAllowed" BOOLEAN NOT NULL DEFAULT true,
    "redactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopDataPolicy_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "GdprEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "legacyId" INTEGER,
    "webhookId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GdprEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GdprEvent_legacyId_key" ON "GdprEvent"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "GdprEvent_webhookId_key" ON "GdprEvent"("webhookId");

-- CreateIndex
CREATE INDEX "GdprEvent_shop_receivedAt_idx" ON "GdprEvent"("shop", "receivedAt");

-- CreateIndex
CREATE INDEX "GdprEvent_shop_topic_idx" ON "GdprEvent"("shop", "topic");
