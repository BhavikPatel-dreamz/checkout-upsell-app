-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "price" DECIMAL(12,2),
    "compareAtPrice" DECIMAL(12,2),
    "inventoryQuantity" INTEGER,
    "availableForSale" BOOLEAN NOT NULL DEFAULT true,
    "selectedOptions" JSONB,
    "imageUrl" TEXT,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT,
    "productStatus" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductVariant_shop_idx" ON "ProductVariant"("shop");

-- CreateIndex
CREATE INDEX "ProductVariant_shop_productId_idx" ON "ProductVariant"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_shop_variantId_key" ON "ProductVariant"("shop", "variantId");
