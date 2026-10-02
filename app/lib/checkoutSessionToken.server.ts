import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.server";

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/** Trust only Shopify-signed checkout UI session tokens (dest claim). */
export function shopFromCheckoutSessionToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  const expected = createHmac("sha256", env.shopifyApiSecret)
    .update(`${headerPart}.${payloadPart}`)
    .digest("base64url");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signaturePart);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlToBuffer(payloadPart).toString("utf8")) as {
      dest?: string;
      aud?: string;
      exp?: number;
    };
    if (payload.aud && payload.aud !== env.shopifyApiKey) return null;
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now() - 30_000) return null;
    const dest = payload.dest?.replace(/^https?:\/\//, "").trim() ?? "";
    if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(dest)) return null;
    return dest.toLowerCase();
  } catch {
    return null;
  }
}
