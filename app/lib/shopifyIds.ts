/** Match Shopify GIDs and numeric ids as the same catalog row. */
export function shopifyNumericId(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/(\d+)\s*$/);
  return match ? match[1] : null;
}

export function shopifyIdAliases(value: string, type: "Product" | "ProductVariant"): string[] {
  const numeric = shopifyNumericId(value);
  const aliases = [value];
  if (numeric) {
    aliases.push(numeric, `gid://shopify/${type}/${numeric}`);
  }
  return Array.from(new Set(aliases));
}

export function shopifyIdSet(ids: string[], type: "Product" | "ProductVariant"): Set<string> {
  const set = new Set<string>();
  for (const id of ids) {
    for (const alias of shopifyIdAliases(id, type)) set.add(alias);
  }
  return set;
}

export function setHasShopifyId(
  set: Set<string>,
  id: string,
  type: "Product" | "ProductVariant",
): boolean {
  return shopifyIdAliases(id, type).some((alias) => set.has(alias));
}
