-- AlterEnum
ALTER TYPE "OfferPlacement" ADD VALUE 'popup';
ALTER TYPE "OfferPlacement" ADD VALUE 'sidebar';

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT 'revenue',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "offerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "neverProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alwaysProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minMarginPercent" DOUBLE PRECISION,
    "maxProducts" INTEGER NOT NULL DEFAULT 5,
    "priceMin" DECIMAL(12,2),
    "priceMax" DECIMAL(12,2),
    "frequencyPerSession" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "offerId" TEXT,
    "channel" TEXT NOT NULL,
    "templateId" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceVariant" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "headline" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "layout" TEXT NOT NULL DEFAULT 'default',
    "offerPolicy" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_shop_offerId_key" ON "Campaign"("shop", "offerId");

-- CreateIndex
CREATE INDEX "Campaign_shop_status_idx" ON "Campaign"("shop", "status");

-- CreateIndex
CREATE INDEX "CampaignRule_shop_campaignId_idx" ON "CampaignRule"("shop", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Experience_shop_offerId_channel_key" ON "Experience"("shop", "offerId", "channel");

-- CreateIndex
CREATE INDEX "Experience_shop_channel_idx" ON "Experience"("shop", "channel");

-- CreateIndex
CREATE INDEX "ExperienceVariant_shop_experienceId_idx" ON "ExperienceVariant"("shop", "experienceId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRule" ADD CONSTRAINT "CampaignRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceVariant" ADD CONSTRAINT "ExperienceVariant_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
