import {
  geminiGenerateBody,
  geminiGenerateUrl,
  openAiChatBody,
  parseGeminiText,
  parseOpenAiChatText,
  parseOpenAiResponsesText,
  resolveLlmConfig,
  type LlmProvider,
} from "./providers";

export type CompleteChatResult =
  | { ok: true; text: string; provider: LlmProvider }
  | { ok: false; error: string };

async function readError(response: Response): Promise<string> {
  const raw = await response.text();
  const clipped = raw.slice(0, 280).trim();
  return clipped ? `HTTP ${response.status}: ${clipped}` : `HTTP ${response.status}`;
}

export async function completeChat(input: {
  provider?: unknown;
  model?: string;
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
  env?: NodeJS.Dict<string>;
  fetchImpl?: typeof fetch;
}): Promise<CompleteChatResult> {
  const config = resolveLlmConfig(input.provider, input.env ?? process.env, input.model);
  if (!config) {
    return {
      ok: false,
      error:
        "No API key for this provider on this store. Settings → Groq (or OpenAI / Grok / Gemini), paste the key, Save rules.",
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? (config.provider === "groq" ? 25000 : 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const authHeaders = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };

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
      if (!response.ok) return { ok: false, error: `Gemini ${await readError(response)}` };
      const text = parseGeminiText(await response.json());
      return text
        ? { ok: true, text, provider: "gemini" }
        : { ok: false, error: "Gemini returned an empty response." };
    }

    const chatResponse = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: authHeaders,
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
    if (chatResponse.ok) {
      const text = parseOpenAiChatText(await chatResponse.json());
      if (text) return { ok: true, text, provider: config.provider };
    }

    if (config.provider === "groq") {
      const chatErr = chatResponse.ok ? "empty chat completion" : await readError(chatResponse);
      const responsesApi = await fetchImpl(`${config.baseUrl}/responses`, {
        method: "POST",
        headers: authHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          input: `${input.system}\n\n${input.user}`,
        }),
      });
      if (!responsesApi.ok) {
        return {
          ok: false,
          error: `Groq chat failed (${chatErr}); responses API ${await readError(responsesApi)}`,
        };
      }
      const text = parseOpenAiResponsesText(await responsesApi.json());
      return text
        ? { ok: true, text, provider: "groq" }
        : { ok: false, error: `Groq responses API returned empty output (${chatErr}).` };
    }

    if (!chatResponse.ok) return { ok: false, error: `${config.provider} ${await readError(chatResponse)}` };
    return { ok: false, error: `${config.provider} returned an empty completion.` };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") return { ok: false, error: `${config.provider} timed out after ${timeoutMs}ms.` };
    return { ok: false, error: `${config.provider} request failed.` };
  } finally {
    clearTimeout(timer);
  }
}
