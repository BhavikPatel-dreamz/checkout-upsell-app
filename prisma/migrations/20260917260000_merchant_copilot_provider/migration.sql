-- AlterTable
ALTER TABLE "MerchantRuleSet" ADD COLUMN IF NOT EXISTS "copilotProvider" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "MerchantRuleSet" ADD COLUMN IF NOT EXISTS "copilotModel" TEXT NOT NULL DEFAULT '';
