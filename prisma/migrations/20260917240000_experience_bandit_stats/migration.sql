-- Treated-only Thompson stats on experience variants (AI-5.6). Holdout is not an arm.
ALTER TABLE "ExperienceVariant" ADD COLUMN IF NOT EXISTS "banditTrials" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExperienceVariant" ADD COLUMN IF NOT EXISTS "banditSuccesses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExperienceVariant" ADD COLUMN IF NOT EXISTS "banditRewardSum" DOUBLE PRECISION NOT NULL DEFAULT 0;
