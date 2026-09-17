-- Per-store LLM keys so each merchant can use their own OpenAI / Grok / Gemini credentials.
ALTER TABLE "MerchantRuleSet" ADD COLUMN IF NOT EXISTS "copilotOpenaiKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MerchantRuleSet" ADD COLUMN IF NOT EXISTS "copilotGrokKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MerchantRuleSet" ADD COLUMN IF NOT EXISTS "copilotGeminiKey" TEXT NOT NULL DEFAULT '';
