-- CreateTable
CREATE TABLE "IdentityLink" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "fromType" "ConsentSubjectType" NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" "ConsentSubjectType" NOT NULL,
    "toId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ingest',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityLink_shop_fromType_fromId_toType_toId_key" ON "IdentityLink"("shop", "fromType", "fromId", "toType", "toId");

-- CreateIndex
CREATE INDEX "IdentityLink_shop_fromType_fromId_idx" ON "IdentityLink"("shop", "fromType", "fromId");

-- CreateIndex
CREATE INDEX "IdentityLink_shop_toType_toId_idx" ON "IdentityLink"("shop", "toType", "toId");
