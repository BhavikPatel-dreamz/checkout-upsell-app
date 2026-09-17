-- Hosted Postgres (including this app's default) often cannot CREATE EXTENSION vector.
-- Store the 64-dim hash embedding as JSON so migrate deploy works without pgvector.
ALTER TABLE "ProductIntelligence" ADD COLUMN IF NOT EXISTS "embedding" JSONB;
