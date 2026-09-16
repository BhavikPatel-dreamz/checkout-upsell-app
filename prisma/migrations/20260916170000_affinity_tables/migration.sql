-- CreateTable
CREATE TABLE "CustomerProductAffinity" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "atcCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerProductAffinity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductProductAffinity" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "relatedProductId" TEXT NOT NULL,
    "viewViewCount" INTEGER NOT NULL DEFAULT 0,
    "atcAtcCount" INTEGER NOT NULL DEFAULT 0,
    "buyBuyCount" INTEGER NOT NULL DEFAULT 0,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductProductAffinity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerProductAffinity_shop_subjectType_subjectId_score_idx" ON "CustomerProductAffinity"("shop", "subjectType", "subjectId", "score");

-- CreateIndex
CREATE INDEX "CustomerProductAffinity_shop_productId_idx" ON "CustomerProductAffinity"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProductAffinity_shop_subjectType_subjectId_productId_key" ON "CustomerProductAffinity"("shop", "subjectType", "subjectId", "productId");

-- CreateIndex
CREATE INDEX "ProductProductAffinity_shop_productId_score_idx" ON "ProductProductAffinity"("shop", "productId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ProductProductAffinity_shop_productId_relatedProductId_key" ON "ProductProductAffinity"("shop", "productId", "relatedProductId");
