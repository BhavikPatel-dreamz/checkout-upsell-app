/* eslint-disable */
import { it } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

it("find a live session token for the shop", async () => {
  const sessions = await db.session.findMany({
    where: { shop: "findash-shipping-12.myshopify.com" },
    select: { id: true, shop: true, isOnline: true, expires: true },
    take: 10,
  });
  console.log("SESSIONS", JSON.stringify(sessions, null, 2));
  await db.$disconnect();
});