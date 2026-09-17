import {
  geminiGenerateBody,
  geminiGenerateUrl,
  openAiChatBody,
  parseGeminiText,
  parseOpenAiChatText,
  resolveLlmConfig,
  type LlmProvider,
} from "./providers";

export async function completeChat(input: {
  provider?: unknown;
  model?: string;
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
  env?: NodeJS.Dict<string>;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; provider: LlmProvider } | null> {
  const config = resolveLlmConfig(input.provider, input.env ?? process.env, input.model);
  if (!config) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);

  try {
    if (config.provider === "gemini") {
      const response = await fetchImpl(geminiGenerateUrl(config.baseUrl, config.model, config.apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(
          geminiGenerateBody({
            system: input.system,
            user: input.user,
            temperature: input.temperature,
          }),
        ),
      });
      if (!response.ok) return null;
      const text = parseGeminiText(await response.json());
      return text ? { text, provider: "gemini" } : null;
    }

    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(
        openAiChatBody({
          model: config.model,
          system: input.system,
          user: input.user,
          temperature: input.temperature,
        }),
      ),
    });
    if (!response.ok) return null;
    const text = parseOpenAiChatText(await response.json());
    return text ? { text, provider: config.provider } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
