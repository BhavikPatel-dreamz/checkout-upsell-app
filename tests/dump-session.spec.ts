import { it } from "vitest";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
it("dump session fields", async () => {
  const s = await db.session.findFirst({ where: { shop: "findash-shipping-12.myshopify.com" } });
  if (!s) { console.log("NO SESSION"); await db.$disconnect(); return; }
  const rec = s as Record<string, unknown>;
  console.log("FIELDS", Object.keys(rec).join(","));
  console.log("ROW", JSON.stringify({ id: rec.id, shop: rec.shop, isOnline: rec.isOnline, expires: rec.expires, state: rec.state && String(rec.state).slice(0,10), accessToken: rec.accessToken && String(rec.accessToken).slice(0,10) }));
  await db.$disconnect();
});
