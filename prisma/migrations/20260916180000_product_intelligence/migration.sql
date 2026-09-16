-- CreateTable
CREATE TABLE "ProductIntelligence" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "status" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB,
    "priceMin" DECIMAL(12,2),
    "priceMax" DECIMAL(12,2),
    "compareAtMax" DECIMAL(12,2),
    "inventoryQuantity" INTEGER,
    "availableForSale" BOOLEAN NOT NULL DEFAULT true,
    "season" TEXT,
    "publishedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductIntelligence_shop_productId_key" ON "ProductIntelligence"("shop", "productId");

-- CreateIndex
CREATE INDEX "ProductIntelligence_shop_category_idx" ON "ProductIntelligence"("shop", "category");

-- CreateIndex
CREATE INDEX "ProductIntelligence_shop_brand_idx" ON "ProductIntelligence"("shop", "brand");
