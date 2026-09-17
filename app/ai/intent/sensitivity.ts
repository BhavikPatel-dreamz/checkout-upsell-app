export interface SensitivityEventLike {
  name: string;
  productId?: string | null;
  query?: string | null;
  context?: unknown;
  occurredAt: Date;
}

export interface CatalogPriceRow {
  productId: string;
  priceMin: number | null;
  priceMax: number | null;
  compareAtMax: number | null;
}

const PRICE_QUERY = /\b(cheap|cheaper|affordable|budget|under\s*\$?\d+|price|pricing)\b/i;
const DISCOUNT_QUERY = /\b(sale|discount|coupon|promo|deal|clearance|% ?off|\boff\b)\b/i;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1, value);
}

function money(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function catalogByProduct(rows: CatalogPriceRow[]): Map<string, CatalogPriceRow> {
  const map = new Map<string, CatalogPriceRow>();
  for (const row of rows) map.set(row.productId, row);
  return map;
}

function unitPrice(row: CatalogPriceRow | undefined): number | null {
  if (!row) return null;
  return money(row.priceMin) ?? money(row.priceMax);
}

function isOnSale(row: CatalogPriceRow | undefined): boolean {
  if (!row) return false;
  const price = unitPrice(row);
  const compare = money(row.compareAtMax);
  return price != null && compare != null && compare > price * 1.01;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export function computePriceDiscountSensitivity(input: {
  events: SensitivityEventLike[];
  catalog?: CatalogPriceRow[];
}): { priceSensitivity: number; discountSensitivity: number } {
  const catalog = catalogByProduct(input.catalog ?? []);
  const viewedPrices: number[] = [];
  let productViews = 0;
  let saleViews = 0;
  let searches = 0;
  let priceQueries = 0;
  let discountQueries = 0;
  let variantSelects = 0;
  let removes = 0;
  let offerSignals = 0;
  let popupViews = 0;
  let atcOnCheaper = 0;
  let atcCount = 0;
  let purchaseOnSale = 0;

  for (const event of input.events) {
    const row = event.productId ? catalog.get(event.productId) : undefined;
    const price = unitPrice(row);
    const query = event.query ?? "";

    switch (event.name) {
      case "product_view":
      case "product_click":
        productViews += 1;
        if (price != null) viewedPrices.push(price);
        if (isOnSale(row)) saleViews += 1;
        break;
      case "product_search":
        searches += 1;
        if (PRICE_QUERY.test(query)) priceQueries += 1;
        if (DISCOUNT_QUERY.test(query)) discountQueries += 1;
        break;
      case "variant_select":
      case "size_select":
        variantSelects += 1;
        break;
      case "remove_from_cart":
        removes += 1;
        break;
      case "add_to_cart":
      case "recommendation_add": {
        atcCount += 1;
        if (price != null && viewedPrices.length) {
          const median = [...viewedPrices].sort((a, b) => a - b)[Math.floor(viewedPrices.length / 2)];
          if (price < median) atcOnCheaper += 1;
        }
        break;
      }
      case "offer_view":
      case "offer_accept":
      case "recommendation_click":
        offerSignals += 1;
        break;
      case "popup_view":
        popupViews += 1;
        break;
      case "purchase":
      case "checkout_completed":
      case "recommendation_purchase":
        if (isOnSale(row)) purchaseOnSale += 1;
        break;
      default:
        break;
    }
  }

  const priceSensitivity = clamp01(
    0.35 * clamp01(coefficientOfVariation(viewedPrices)) +
      0.2 * clamp01(variantSelects / 4) +
      0.2 * clamp01(removes / 3) +
      0.15 * (searches ? priceQueries / searches : 0) +
      0.1 * (atcCount ? atcOnCheaper / atcCount : 0),
  );

  const discountSensitivity = clamp01(
    0.3 * (productViews ? saleViews / productViews : 0) +
      0.25 * (searches ? discountQueries / searches : 0) +
      0.25 * clamp01(offerSignals / 3) +
      0.1 * clamp01(popupViews / 2) +
      0.1 * clamp01(purchaseOnSale),
  );

  return { priceSensitivity, discountSensitivity };
}
