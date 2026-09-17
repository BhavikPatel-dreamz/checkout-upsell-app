-- AlterTable
ALTER TABLE "MerchantRuleSet" ADD COLUMN IF NOT EXISTS "autopilotPublish" BOOLEAN NOT NULL DEFAULT false;
