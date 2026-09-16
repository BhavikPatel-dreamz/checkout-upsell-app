CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "ProductIntelligence" ADD COLUMN IF NOT EXISTS "embedding" vector(64);
