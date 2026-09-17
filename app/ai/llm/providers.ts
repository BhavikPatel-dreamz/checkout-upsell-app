export const LLM_PROVIDERS = ["openai", "grok", "groq", "gemini"] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export type LlmProviderChoice = LlmProvider | "auto" | "none";

export const LLM_PROVIDER_LABELS: Record<LlmProviderChoice, string> = {
  auto: "Auto (first configured key)",
  none: "Off (aggregates only)",
  openai: "OpenAI",
  grok: "Grok (xAI)",
  groq: "Groq",
  gemini: "Gemini (Google)",
};

export const DEFAULT_LLM_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-4o-mini",
  grok: "grok-2-latest",
  groq: "openai/gpt-oss-20b",
  gemini: "gemini-2.0-flash",
};

export const DEFAULT_LLM_BASE_URLS: Record<Exclude<LlmProvider, "gemini">, string> = {
  openai: "https://api.openai.com/v1",
  grok: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
};

export function normalizeLlmProvider(value: unknown): LlmProviderChoice {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "none" || raw === "off" || raw === "disabled") return "none";
  if (raw === "openai" || raw === "chatgpt") return "openai";
  if (raw === "groq") return "groq";
  if (raw === "grok" || raw === "xai" || raw === "x.ai") return "grok";
  if (raw === "gemini" || raw === "google") return "gemini";
  return "auto";
}

export function normalizeLlmModel(value: unknown, provider: LlmProvider): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || DEFAULT_LLM_MODELS[provider];
}

export interface LlmProviderConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

function envTrim(env: NodeJS.Dict<string> | undefined, ...keys: string[]): string {
  if (!env) return "";
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return "";
}

export interface ShopLlmKeys {
  openai?: string;
  grok?: string;
  groq?: string;
  gemini?: string;
}

/** Shop keys override app env so each store can use its own model credentials. */
export function mergeShopLlmEnv(
  env: NodeJS.Dict<string> | undefined,
  shop?: ShopLlmKeys | null,
): NodeJS.Dict<string> {
  const merged: NodeJS.Dict<string> = { ...(env ?? {}) };
  const openai = shop?.openai?.trim();
  const grok = shop?.grok?.trim();
  const groq = shop?.groq?.trim();
  const gemini = shop?.gemini?.trim();
  if (openai) merged.OPENAI_API_KEY = openai;
  if (grok) {
    merged.XAI_API_KEY = grok;
    merged.GROK_API_KEY = grok;
  }
  if (groq) merged.GROQ_API_KEY = groq;
  if (gemini) merged.GEMINI_API_KEY = gemini;
  return merged;
}

export function llmConfigForProvider(
  provider: LlmProvider,
  env: NodeJS.Dict<string> | undefined = process.env,
): LlmProviderConfig | null {
  if (provider === "openai") {
    const apiKey = envTrim(env, "OPENAI_API_KEY");
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: envTrim(env, "OPENAI_MODEL") || DEFAULT_LLM_MODELS.openai,
      baseUrl: (envTrim(env, "OPENAI_BASE_URL") || DEFAULT_LLM_BASE_URLS.openai).replace(/\/$/, ""),
    };
  }
  if (provider === "grok") {
    const apiKey = envTrim(env, "XAI_API_KEY", "GROK_API_KEY");
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: envTrim(env, "GROK_MODEL", "XAI_MODEL") || DEFAULT_LLM_MODELS.grok,
      baseUrl: (envTrim(env, "XAI_BASE_URL", "GROK_BASE_URL") || DEFAULT_LLM_BASE_URLS.grok).replace(
        /\/$/,
        "",
      ),
    };
  }
  if (provider === "groq") {
    const apiKey = envTrim(env, "GROQ_API_KEY");
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: envTrim(env, "GROQ_MODEL") || DEFAULT_LLM_MODELS.groq,
      baseUrl: (envTrim(env, "GROQ_BASE_URL") || DEFAULT_LLM_BASE_URLS.groq).replace(/\/$/, ""),
    };
  }
  if (provider === "gemini") {
    const apiKey = envTrim(env, "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY");
    if (!apiKey) return null;
    return {
      provider: "gemini",
      apiKey,
      model: envTrim(env, "GEMINI_MODEL") || DEFAULT_LLM_MODELS.gemini,
      baseUrl: (envTrim(env, "GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta").replace(
        /\/$/,
        "",
      ),
    };
  }
  return null;
}

export function configuredLlmProviders(
  env: NodeJS.Dict<string> | undefined = process.env,
): Record<LlmProvider, boolean> {
  return {
    openai: llmConfigForProvider("openai", env) != null,
    grok: llmConfigForProvider("grok", env) != null,
    groq: llmConfigForProvider("groq", env) != null,
    gemini: llmConfigForProvider("gemini", env) != null,
  };
}

export function anyLlmConfigured(env: NodeJS.Dict<string> | undefined = process.env): boolean {
  const flags = configuredLlmProviders(env);
  return flags.openai || flags.grok || flags.groq || flags.gemini;
}

export function resolveLlmConfig(
  choice: unknown,
  env: NodeJS.Dict<string> | undefined = process.env,
  modelOverride?: string,
): LlmProviderConfig | null {
  const normalized = normalizeLlmProvider(choice);
  if (normalized === "none") return null;
  const order: LlmProvider[] =
    normalized === "auto" ? [...LLM_PROVIDERS] : [normalized];
  for (const provider of order) {
    const config = llmConfigForProvider(provider, env);
    if (!config) continue;
    const override = typeof modelOverride === "string" ? modelOverride.trim() : "";
    return { ...config, model: override || config.model };
  }
  return null;
}

/** OpenAI-compatible chat/completions body (OpenAI, xAI Grok, Groq). */
export function openAiChatBody(input: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
}): Record<string, unknown> {
  return {
    model: input.model,
    temperature: input.temperature ?? 0.2,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  };
}

export function geminiGenerateUrl(baseUrl: string, model: string, apiKey: string): string {
  const encoded = encodeURIComponent(model);
  return `${baseUrl}/models/${encoded}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

export function geminiGenerateBody(input: { system: string; user: string; temperature?: number }) {
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: [{ text: input.user }] }],
    generationConfig: { temperature: input.temperature ?? 0.2 },
  };
}

export function parseOpenAiChatText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  const text = content.trim();
  return text || null;
}

/** Groq / OpenAI Responses API (`client.responses.create`). */
export function parseOpenAiResponsesText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const direct = (body as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const output = (body as { output?: Array<{ content?: Array<{ text?: unknown; type?: string }> }> }).output;
  if (!Array.isArray(output)) return null;
  const parts: string[] = [];
  for (const item of output) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string" && part.text.trim()) parts.push(part.text.trim());
    }
  }
  const text = parts.join("\n").trim();
  return text || null;
}

export function parseGeminiText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const parts = (body as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  }).candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
  return text || null;
}
