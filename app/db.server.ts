import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

function createPrisma(): PrismaClient {
  return new PrismaClient();
}

function hasRequiredDelegates(client: PrismaClient): boolean {
  const asAny = client as PrismaClient & {
    productRelation?: { findMany?: unknown };
    merchantRuleSet?: { findUnique?: unknown };
    shopperProfile?: { upsert?: unknown };
    campaign?: { upsert?: unknown };
    identityInterruption?: { upsert?: unknown };
  };
  return (
    typeof asAny.productRelation?.findMany === "function" &&
    typeof asAny.merchantRuleSet?.findUnique === "function" &&
    typeof asAny.shopperProfile?.upsert === "function" &&
    typeof asAny.campaign?.upsert === "function" &&
    typeof asAny.identityInterruption?.upsert === "function"
  );
}

/**
 * Reuse one client in dev, but replace it after `prisma generate` if the
 * cached instance was created before models like ProductRelation existed.
 */
function getPrisma(): PrismaClient {
  const cached = global.prismaGlobal;
  if (cached && hasRequiredDelegates(cached)) return cached;

  const client = createPrisma();
  if (process.env.NODE_ENV !== "production") {
    global.prismaGlobal = client;
  }
  return client;
}

const prisma = getPrisma();

export default prisma;
