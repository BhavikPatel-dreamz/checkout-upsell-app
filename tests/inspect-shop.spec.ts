/* eslint-disable */
import { it } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const SHOP = "findash-shipping-12.myshopify.com";

it("inspect shop sync state", async () => {
  const variants = await db.productVariant.count({ where: { shop: SHOP } });
  const openRuns = await db.syncLog.count({
    where: { shop: SHOP, status: { in: ["running", "paused"] } },
  });
  const logs = await db.syncLog.findMany({
    where: { shop: SHOP },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: {
      id: true, status: true, upserted: true, removed: true,
      cursor: true, pages: true, startedAt: true, finishedAt: true, error: true,
    },
  });
  console.log("VARIANT_COUNT", variants);
  console.log("OPEN_RUNS", openRuns);
  console.log("RECENT_LOGS", JSON.stringify(logs, null, 2));
  await db.$disconnect();
});