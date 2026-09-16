-- CreateEnum
CREATE TYPE "ConsentSubjectType" AS ENUM ('customer', 'anon', 'session');

-- CreateTable
CREATE TABLE "ShopperEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "surface" TEXT,
    "sessionId" TEXT,
    "customerId" TEXT,
    "anonId" TEXT,
    "consentAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "consentMarketing" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "variantId" TEXT,
    "collectionId" TEXT,
    "query" TEXT,
    "recommendationId" TEXT,
    "campaignId" TEXT,
    "experienceId" TEXT,
    "entities" JSONB,
    "context" JSONB,
    "attribution" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopperEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopperEvent_shop_eventId_key" ON "ShopperEvent"("shop", "eventId");

-- CreateIndex
CREATE INDEX "ShopperEvent_shop_occurredAt_idx" ON "ShopperEvent"("shop", "occurredAt");

-- CreateIndex
CREATE INDEX "ShopperEvent_shop_name_occurredAt_idx" ON "ShopperEvent"("shop", "name", "occurredAt");

-- CreateIndex
CREATE INDEX "ShopperEvent_shop_customerId_occurredAt_idx" ON "ShopperEvent"("shop", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "ShopperEvent_shop_anonId_occurredAt_idx" ON "ShopperEvent"("shop", "anonId", "occurredAt");

-- CreateIndex
CREATE INDEX "ShopperEvent_shop_sessionId_occurredAt_idx" ON "ShopperEvent"("shop", "sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "ShopperEvent_shop_recommendationId_idx" ON "ShopperEvent"("shop", "recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentState_shop_subjectType_subjectId_key" ON "ConsentState"("shop", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ConsentState_shop_updatedAt_idx" ON "ConsentState"("shop", "updatedAt");
