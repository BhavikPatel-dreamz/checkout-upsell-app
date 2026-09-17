-- CreateTable
CREATE TABLE IF NOT EXISTS "Experiment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExperimentAssignment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "variantId" TEXT,
    "holdout" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Experiment_shop_experienceId_key" ON "Experiment"("shop", "experienceId");
CREATE INDEX IF NOT EXISTS "Experiment_shop_status_idx" ON "Experiment"("shop", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ExperimentAssignment_shop_experimentId_subjectType_subjectId_key" ON "ExperimentAssignment"("shop", "experimentId", "subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "ExperimentAssignment_shop_experimentId_idx" ON "ExperimentAssignment"("shop", "experimentId");
CREATE INDEX IF NOT EXISTS "ExperimentAssignment_shop_subjectId_idx" ON "ExperimentAssignment"("shop", "subjectId");

ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
