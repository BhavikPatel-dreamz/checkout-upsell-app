-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('cross_sell', 'bundle', 'volume', 'free_gift', 'subscription');

-- CreateEnum
CREATE TYPE "OfferPlacement" AS ENUM ('product_page', 'cart_drawer', 'checkout', 'post_purchase', 'order_status');

-- CreateEnum
CREATE TYPE "OfferEventType" AS ENUM ('viewed', 'accepted', 'declined');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OfferType" NOT NULL,
    "placement" "OfferPlacement" NOT NULL,
    "targetProductIds" TEXT[],
    "triggerRules" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferEvent" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventType" "OfferEventType" NOT NULL,
    "orderId" TEXT,
    "revenue" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shop_key" ON "Shop"("shop");

-- CreateIndex
CREATE INDEX "Offer_shop_idx" ON "Offer"("shop");

-- CreateIndex
CREATE INDEX "Offer_shop_placement_isActive_idx" ON "Offer"("shop", "placement", "isActive");

-- CreateIndex
CREATE INDEX "OfferEvent_offerId_eventType_idx" ON "OfferEvent"("offerId", "eventType");

-- CreateIndex
CREATE INDEX "OfferEvent_shop_idx" ON "OfferEvent"("shop");

-- CreateIndex
CREATE INDEX "OfferEvent_offerId_createdAt_idx" ON "OfferEvent"("offerId", "createdAt");

-- AddForeignKey
ALTER TABLE "OfferEvent" ADD CONSTRAINT "OfferEvent_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
