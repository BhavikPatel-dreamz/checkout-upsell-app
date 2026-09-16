import type { BrowseActivityRow, IdentityLookup } from "./browseActivity.server";
import type { EligibleOfferPayload } from "./eligibleOffer";

const CACHE_TTL_MS = 1000 * 60 * 5;
const LLM_TIMEOUT_MS = 2500;
const cache = new Map<string, { expiresAt: number; ids: string[] }>();

/** Max SKUs sent to the LLM. The model only reorders this head; it never adds products. */
export const LLM_TOP_K = 8;

export function llmPickerEnabled(): boolean {
  const flag = process.env.AI_RECOMMEND_LLM?.trim().toLowerCase();
  if (flag !== "1" && flag !== "true" && flag !== "on") return false;
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function splitLlmTopK<T>(items: T[], k = LLM_TOP_K): { head: T[]; tail: T[] } {
  const limit = Math.max(0, k);
  return { head: items.slice(0, limit), tail: items.slice(limit) };
}

function identityKey(identity: IdentityLookup): string {
  return identity.customerId || identity.guestKey || identity.clientId || "anon";
}

function cacheKey(shop: string, identity: IdentityLookup, offerId: string, pool: EligibleOfferPayload[]): string {
  const poolIds = pool.map((item) => item.variantId).join(",");
  return `${shop}:${identityKey(identity)}:${offerId}:${poolIds}`;
}

function pruneCache(now = Date.now()) {
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }
}

export function applyLlmPoolOrder(
  pool: EligibleOfferPayload[],
  orderedIds: string[],
): EligibleOfferPayload[] {
  const byVariant = new Map(pool.map((item) => [item.variantId, item]));
  const byProduct = new Map(pool.map((item) => [item.productId, item]));
  const seen = new Set<string>();
  const ordered: EligibleOfferPayload[] = [];

  for (const id of orderedIds) {
    const match = byVariant.get(id) ?? byProduct.get(id);
    if (!match || seen.has(match.variantId)) continue;
    seen.add(match.variantId);
    ordered.push(match);
  }

  for (const item of pool) {
    if (seen.has(item.variantId)) continue;
    ordered.push(item);
  }
  return ordered;
}

export function parseLlmPoolIds(raw: string, allowed: Set<string>): string[] {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .filter((value) => allowed.has(value));
  } catch {
    return [];
  }
}

async function requestLlmOrder(options: {
  shop: string;
  pool: EligibleOfferPayload[];
  activity: BrowseActivityRow[];
}): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const endpoint = process.env.OPENAI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const allowed = new Set(options.pool.flatMap((item) => [item.variantId, item.productId]));
  const poolLines = options.pool.map(
    (item) => `${item.variantId} | product ${item.productId} | ${item.productTitle}`,
  );
  const activityLines = options.activity.slice(0, 25).map((row) => {
    return `${row.eventType} product=${row.productId ?? ""} variant=${row.variantId ?? ""} collection=${row.collectionId ?? ""} query=${row.query ?? ""} at=${row.occurredAt.toISOString()}`;
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You only reorder the provided upsell pool for one Shopify shop. Return a JSON array of variant ids from that pool, best first. Never invent ids, never add products, never use other shops.",
          },
          {
            role: "user",
            content: `Shop: ${options.shop}\nPool:\n${poolLines.join("\n")}\nRecent activity:\n${activityLines.join("\n") || "(none)"}`,
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    const ids = parseLlmPoolIds(content, allowed);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function pickPoolWithOptionalLlm(options: {
  shop: string;
  offerId: string;
  identity: IdentityLookup;
  pool: EligibleOfferPayload[];
  activity: BrowseActivityRow[];
}): Promise<EligibleOfferPayload[]> {
  const { shop, offerId, identity, pool, activity } = options;
  if (pool.length <= 1 || !llmPickerEnabled()) return pool;

  pruneCache();
  const key = cacheKey(shop, identity, offerId, pool);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return applyLlmPoolOrder(pool, cached.ids);
  }

  const ids = await requestLlmOrder({ shop, pool, activity });
  if (!ids) return pool;

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, ids });
  return applyLlmPoolOrder(pool, ids);
}
