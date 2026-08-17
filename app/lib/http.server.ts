// Small HTTP helpers for JSON resource routes so route handlers stay thin
// and error shapes stay consistent across the app's API.

type JsonBodyResult = { ok: true; body: unknown } | { ok: false };

/**
 * Parse a request body as JSON. Returns { ok: false } on empty/invalid JSON
 * so callers can respond with a 400 instead of throwing.
 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

export function badRequest(errors: Record<string, string>) {
  return Response.json({ errors }, { status: 400 });
}

export function notFound(message = "Not found") {
  return Response.json({ error: message }, { status: 404 });
}

export function methodNotAllowed() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
