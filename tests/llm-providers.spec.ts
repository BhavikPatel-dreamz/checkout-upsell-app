import { describe, expect, it } from "vitest";
import { completeChat } from "../app/ai/llm/complete.server";
import {
  configuredLlmProviders,
  geminiGenerateUrl,
  normalizeLlmProvider,
  parseGeminiText,
  parseOpenAiChatText,
  resolveLlmConfig,
} from "../app/ai/llm/providers";

describe("multi-provider LLM (OpenAI, Grok, Gemini)", () => {
  it("normalizes aliases and reads env keys without mixing providers", () => {
    expect(normalizeLlmProvider("xai")).toBe("grok");
    expect(normalizeLlmProvider("google")).toBe("gemini");
    expect(normalizeLlmProvider("off")).toBe("none");
    const env = {
      OPENAI_API_KEY: "sk-test",
      XAI_API_KEY: "xai-test",
      GEMINI_API_KEY: "gem-test",
    };
    expect(configuredLlmProviders(env)).toEqual({ openai: true, grok: true, gemini: true });
    expect(resolveLlmConfig("none", env)).toBeNull();
    expect(resolveLlmConfig("grok", env)?.provider).toBe("grok");
    expect(resolveLlmConfig("grok", env)?.baseUrl).toContain("x.ai");
    expect(resolveLlmConfig("gemini", env)?.model).toBe("gemini-2.0-flash");
    expect(geminiGenerateUrl("https://generativelanguage.googleapis.com/v1beta", "gemini-2.0-flash", "gem-test")).toContain(
      "generateContent",
    );
  });

  it("parses OpenAI-compatible and Gemini responses", () => {
    expect(parseOpenAiChatText({ choices: [{ message: { content: " hello " } }] })).toBe("hello");
    expect(
      parseGeminiText({
        candidates: [{ content: { parts: [{ text: "part-a" }, { text: "part-b" }] } }],
      }),
    ).toBe("part-apart-b");
  });

  it("posts chat/completions for Grok and generateContent for Gemini", async () => {
    const grokCalls: string[] = [];
    const grok = await completeChat({
      provider: "grok",
      env: { XAI_API_KEY: "xai-test" },
      system: "sys",
      user: "hi",
      fetchImpl: async (url, init) => {
        grokCalls.push(String(url));
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xai-test");
        return new Response(JSON.stringify({ choices: [{ message: { content: "grok-ok" } }] }), {
          status: 200,
        });
      },
    });
    expect(grok).toEqual({ text: "grok-ok", provider: "grok" });
    expect(grokCalls[0]).toContain("api.x.ai");

    const gemini = await completeChat({
      provider: "gemini",
      env: { GEMINI_API_KEY: "gem-test" },
      system: "sys",
      user: "hi",
      fetchImpl: async (url) => {
        expect(String(url)).toContain("generativelanguage.googleapis.com");
        expect(String(url)).toContain("generateContent");
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "gem-ok" }] } }] }),
          { status: 200 },
        );
      },
    });
    expect(gemini).toEqual({ text: "gem-ok", provider: "gemini" });
  });
});
