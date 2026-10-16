const DEFAULT_ALLOW_HEADERS =
  "Accept, Authorization, Content-Type, X-Shopify-Shop-Domain, X-Requested-With";

export function corsHeaders(request?: Request): HeadersInit {
  const requested = request?.headers.get("Access-Control-Request-Headers")?.trim();
  const allowHeaders = requested
    ? `${DEFAULT_ALLOW_HEADERS}, ${requested}`
    : DEFAULT_ALLOW_HEADERS;
  const origin = request?.headers.get("Origin")?.trim();
  const allowOrigin =
    origin &&
    (/^https:\/\/([a-z0-9-]+\.myshopify\.com|extensions\.shopifycdn\.com|cdn\.shopify\.com)$/i.test(
      origin,
    ) ||
      origin.endsWith(".shopifycloud.com"))
      ? origin
      : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
}

export function corsPreflight(request?: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonWithCors(data: unknown, init?: { status?: number }, request?: Request) {
  return Response.json(data, {
    status: init?.status ?? 200,
    headers: corsHeaders(request),
  });
}

export function withCors(response: Response, request?: Request) {
  const headers = corsHeaders(request);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
