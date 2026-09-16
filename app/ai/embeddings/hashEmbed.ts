export const EMBEDDING_DIM = 64;

export function catalogEmbeddingText(input: {
  title: string;
  brand?: string | null;
  category?: string | null;
  tags?: string[];
  collections?: string[];
}): string {
  return [
    input.title,
    input.brand ?? "",
    input.category ?? "",
    ...(input.tags ?? []),
    ...(input.collections ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function tokenHash(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash;
}

/** Deterministic bag-of-tokens vector (no external embedding API). L2-normalized. */
export function hashEmbedding(text: string, dim = EMBEDDING_DIM): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
  for (const token of tokens) {
    const hash = tokenHash(token);
    const index = Math.abs(hash) % dim;
    vec[index] += hash & 1 ? 1 : -1;
  }
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vec;
  return vec.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value.toFixed(8) : "0")).join(",")}]`;
}

export function parseVectorLiteral(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!inner) return null;
  const values = inner.split(",").map((part) => Number.parseFloat(part.trim()));
  if (values.some((value) => !Number.isFinite(value))) return null;
  return values;
}
