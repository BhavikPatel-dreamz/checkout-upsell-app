function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Sticky 0–1 bucket for shop + experiment + identity. */
export function experimentBucket(shop: string, experimentId: string, identity: string): number {
  return fnv1a(`${shop.trim().toLowerCase()}\0${experimentId}\0${identity.trim()}`) / 0xffffffff;
}

/** Equal-weight A/B (or N-way) among variant ids. Same identity always gets the same arm. */
export function pickAbVariantId(
  shop: string,
  experimentId: string,
  identity: string,
  variantIds: string[],
): string | null {
  if (variantIds.length === 0) return null;
  if (variantIds.length === 1) return variantIds[0];
  const index = Math.min(
    variantIds.length - 1,
    Math.floor(experimentBucket(shop, experimentId, identity) * variantIds.length),
  );
  return variantIds[index];
}
