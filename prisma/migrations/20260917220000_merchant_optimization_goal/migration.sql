-- AlterTable
ALTER TABLE "MerchantRuleSet" ADD COLUMN IF NOT EXISTS "optimizationGoal" TEXT NOT NULL DEFAULT 'revenue';
