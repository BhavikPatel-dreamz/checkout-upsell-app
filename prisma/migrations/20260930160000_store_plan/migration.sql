-- AlterTable
ALTER TABLE "StoreBillingOffer" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "StoreBillingOffer" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- Stores that already paid on the previous app start on Silver.
UPDATE "StoreBillingOffer" SET "plan" = 'silver' WHERE "legacySubscriber" = true;
