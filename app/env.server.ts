type EnvironmentSource = NodeJS.ProcessEnv;

export type ServerEnvironment = {
  databaseUrl: string;
  shopifyApiKey: string;
  shopifyApiSecret: string;
  shopifyAppUrl: string;
  scopes?: string[];
  shopCustomDomain?: string;
};

function requiredValue(source: EnvironmentSource, name: string): string {
  const value = source[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requiredUrl(
  source: EnvironmentSource,
  name: string,
  allowedProtocols: string[],
): string {
  const value = requiredValue(source, name);

  try {
    const url = new URL(value);
    if (!allowedProtocols.includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(
      `${name} must be a valid URL using ${allowedProtocols.join(" or ")}`,
    );
  }

  return value;
}

export function getServerEnvironment(
  source: EnvironmentSource = process.env,
): ServerEnvironment {
  const scopes = source.SCOPES?.split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    databaseUrl: requiredUrl(source, "DATABASE_URL", ["postgres:", "postgresql:"]),
    shopifyApiKey: requiredValue(source, "SHOPIFY_API_KEY"),
    shopifyApiSecret: requiredValue(source, "SHOPIFY_API_SECRET"),
    shopifyAppUrl: requiredUrl(source, "SHOPIFY_APP_URL", ["https:", "http:"]),
    ...(scopes?.length ? { scopes } : {}),
    ...(source.SHOP_CUSTOM_DOMAIN?.trim()
      ? { shopCustomDomain: source.SHOP_CUSTOM_DOMAIN.trim() }
      : {}),
  };
}

export const env = getServerEnvironment();
