import { env } from "../env.server";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

const ensuredShops = new Set<string>();

function pixelSettings() {
  return {
    accountID: "checkout-upsell",
    apiBase: env.shopifyAppUrl.replace(/\/$/, ""),
  };
}

function isAccessDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /access denied|access scope/i.test(message);
}

function isAuthHandshake(error: unknown): boolean {
  if (error instanceof Response) {
    const location = error.headers.get("Location") ?? "";
    return error.status === 302 || /session-token|\/auth\//i.test(location);
  }
  return false;
}

function isRedirectResponse(response: Response): boolean {
  const location = response.headers.get("Location") ?? "";
  return (
    response.status === 302 ||
    response.status === 401 ||
    /session-token|\/auth\//i.test(location)
  );
}

function isAlreadyExists(errors: Array<{ message?: string; code?: string }>): boolean {
  return errors.some((error) =>
    /already|taken|exists/i.test(`${error.code ?? ""} ${error.message ?? ""}`),
  );
}

const WEB_PIXEL_QUERY = `#graphql
  query CheckoutUpsellWebPixel {
    webPixel {
      id
      settings
    }
  }
`;

const WEB_PIXEL_CREATE = `#graphql
  mutation EnsureWebPixel($webPixel: WebPixelInput!) {
    webPixelCreate(webPixel: $webPixel) {
      userErrors {
        field
        message
        code
      }
      webPixel {
        id
      }
    }
  }
`;

const WEB_PIXEL_UPDATE = `#graphql
  mutation UpdateWebPixel($id: ID!, $webPixel: WebPixelInput!) {
    webPixelUpdate(id: $id, webPixel: $webPixel) {
      userErrors {
        field
        message
        code
      }
      webPixel {
        id
      }
    }
  }
`;

async function graphqlJson<T>(
  admin: AdminGraphql,
  query: string,
  options?: { variables?: Record<string, unknown> },
): Promise<T | null> {
  const response = await admin.graphql(query, options);
  if (isRedirectResponse(response)) return null;
  if (!response.ok) {
    throw new Error(`Web pixel GraphQL failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function readWebPixelId(admin: AdminGraphql): Promise<string | null> {
  try {
    const existingJson = await graphqlJson<{
      data?: { webPixel?: { id?: string } | null };
    }>(admin, WEB_PIXEL_QUERY);
    return existingJson?.data?.webPixel?.id ?? null;
  } catch (error) {
    if (isAccessDenied(error) || isAuthHandshake(error)) return null;
    throw error;
  }
}

export async function ensureWebPixel(admin: AdminGraphql, shop?: string | null): Promise<void> {
  if (shop && ensuredShops.has(shop)) return;

  try {
    const settings = pixelSettings();
    const createJson = await graphqlJson<{
      data?: {
        webPixelCreate?: {
          userErrors?: Array<{ message?: string; code?: string }>;
          webPixel?: { id?: string };
        };
      };
    }>(admin, WEB_PIXEL_CREATE, {
      variables: { webPixel: { settings } },
    });
    if (!createJson) return;

    const createErrors = createJson.data?.webPixelCreate?.userErrors ?? [];

    if (createJson.data?.webPixelCreate?.webPixel?.id && createErrors.length === 0) {
      if (shop) ensuredShops.add(shop);
      return;
    }

    if (createErrors.length > 0 && !isAlreadyExists(createErrors)) {
      console.warn("webPixelCreate errors:", createErrors);
      return;
    }

    const existingId = await readWebPixelId(admin);
    if (!existingId) {
      if (shop) ensuredShops.add(shop);
      return;
    }

    const updateJson = await graphqlJson<{
      data?: { webPixelUpdate?: { userErrors?: Array<{ message?: string }> } };
    }>(admin, WEB_PIXEL_UPDATE, {
      variables: { id: existingId, webPixel: { settings } },
    });
    if (!updateJson) return;

    const updateErrors = updateJson.data?.webPixelUpdate?.userErrors ?? [];
    if (updateErrors.length > 0) console.warn("webPixelUpdate errors:", updateErrors);

    if (shop) ensuredShops.add(shop);
  } catch (error) {
    if (isAuthHandshake(error)) return;
    if (isAccessDenied(error)) {
      console.warn(
        "ensureWebPixel skipped: grant write_pixels, read_pixels, and read_customer_events, then re-auth the app.",
      );
      return;
    }
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn("ensureWebPixel failed:", message);
  }
}
