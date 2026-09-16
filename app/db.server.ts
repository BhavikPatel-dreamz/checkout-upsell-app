import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

function createPrisma(): PrismaClient {
  return new PrismaClient();
}

function hasProductRelation(client: PrismaClient): boolean {
  return typeof (client as PrismaClient & { productRelation?: { findMany?: unknown } }).productRelation
    ?.findMany === "function";
}

/**
 * Reuse one client in dev, but replace it after `prisma generate` if the
 * cached instance was created before models like ProductRelation existed.
 */
function getPrisma(): PrismaClient {
  const cached = global.prismaGlobal;
  if (cached && hasProductRelation(cached)) return cached;

  const client = createPrisma();
  if (process.env.NODE_ENV !== "production") {
    global.prismaGlobal = client;
  }
  return client;
}

const prisma = getPrisma();

export default prisma;
