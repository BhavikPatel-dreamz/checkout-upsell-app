-- CreateEnum
CREATE TYPE "ProductRelationKind" AS ENUM ('fbt', 'similar', 'complementary');

-- CreateEnum
CREATE TYPE "ProductRelationSource" AS ENUM ('stat', 'embed', 'merchant');

-- CreateTable
CREATE TABLE "ProductRelation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "relatedProductId" TEXT NOT NULL,
    "kind" "ProductRelationKind" NOT NULL,
    "source" "ProductRelationSource" NOT NULL DEFAULT 'stat',
    "score" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductRelation_shop_productId_relatedProductId_kind_key" ON "ProductRelation"("shop", "productId", "relatedProductId", "kind");

-- CreateIndex
CREATE INDEX "ProductRelation_shop_productId_kind_score_idx" ON "ProductRelation"("shop", "productId", "kind", "score");
