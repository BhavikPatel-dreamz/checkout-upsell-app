-- CreateEnum
CREATE TYPE "BrowseActivityType" AS ENUM ('product_viewed', 'collection_viewed', 'search_submitted', 'product_added_to_cart');

-- CreateTable
CREATE TABLE "BrowseActivity" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventType" "BrowseActivityType" NOT NULL,
    "customerId" TEXT,
    "guestKey" TEXT,
    "clientId" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "collectionId" TEXT,
    "query" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrowseActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrowseActivity_shop_occurredAt_idx" ON "BrowseActivity"("shop", "occurredAt");

-- CreateIndex
CREATE INDEX "BrowseActivity_shop_customerId_occurredAt_idx" ON "BrowseActivity"("shop", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "BrowseActivity_shop_guestKey_occurredAt_idx" ON "BrowseActivity"("shop", "guestKey", "occurredAt");

-- CreateIndex
CREATE INDEX "BrowseActivity_shop_clientId_occurredAt_idx" ON "BrowseActivity"("shop", "clientId", "occurredAt");
