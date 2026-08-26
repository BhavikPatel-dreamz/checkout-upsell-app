-- AlterTable
ALTER TABLE "OfferEvent"
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "guestKey" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "variantId" TEXT,
ADD COLUMN     "placement" "OfferPlacement";

-- CreateIndex
CREATE INDEX "OfferEvent_shop_eventType_customerId_idx"
ON "OfferEvent"("shop", "eventType", "customerId");

-- CreateIndex
CREATE INDEX "OfferEvent_shop_eventType_guestKey_idx"
ON "OfferEvent"("shop", "eventType", "guestKey");

-- CreateIndex
CREATE INDEX "OfferEvent_shop_eventType_offerId_productId_variantId_customerId_idx"
ON "OfferEvent"("shop", "eventType", "offerId", "productId", "variantId", "customerId");

-- CreateIndex
CREATE INDEX "OfferEvent_shop_eventType_offerId_productId_variantId_guestKey_idx"
ON "OfferEvent"("shop", "eventType", "offerId", "productId", "variantId", "guestKey");
