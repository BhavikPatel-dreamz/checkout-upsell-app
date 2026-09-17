import db from "../../db.server";
import { identityKey } from "../decide/contract";
import {
  evaluateStoredFrequency,
  FREQUENCY_WINDOW_MS,
  isInterruptiveChannel,
  shownInWindow,
  type StoredChannelFrequency,
} from "./frequency";

function toStored(row: {
  lastShownAt: Date | null;
  sessionId: string | null;
  sessionShownAt: Date | null;
  windowStart: Date;
  shownInWindow: number;
}): StoredChannelFrequency {
  return {
    lastShownAt: row.lastShownAt,
    sessionId: row.sessionId,
    sessionShownAt: row.sessionShownAt,
    windowStart: row.windowStart,
    shownInWindow: row.shownInWindow,
  };
}

export async function gateAndRecordInterruption(input: {
  shop: string;
  customerId?: string | null;
  anonId?: string | null;
  sessionId?: string | null;
  channel: string;
  wouldShow: boolean;
  now?: Date;
}): Promise<{ allow: boolean; reason: string }> {
  const now = input.now ?? new Date();
  const key = identityKey(input);
  const rows = await db.identityInterruption.findMany({
    where: { shop: input.shop, identityKey: key },
  });

  let interruptiveShownInWindow = 0;
  for (const row of rows) {
    if (!isInterruptiveChannel(row.channel)) continue;
    interruptiveShownInWindow += shownInWindow(toStored(row), now);
  }

  const current = rows.find((row) => row.channel === input.channel);
  const decision = evaluateStoredFrequency({
    channel: input.channel,
    sessionId: input.sessionId,
    row: current ? toStored(current) : null,
    interruptiveShownInWindow,
    now,
  });

  if (!input.wouldShow || !decision.allow) return decision;

  const windowExpired = current
    ? now.getTime() - current.windowStart.getTime() >= FREQUENCY_WINDOW_MS
    : true;
  const windowStart = windowExpired || !current ? now : current.windowStart;
  const shownInWindowNext = (windowExpired || !current ? 0 : current.shownInWindow) + 1;

  await db.identityInterruption.upsert({
    where: {
      shop_identityKey_channel: {
        shop: input.shop,
        identityKey: key,
        channel: input.channel,
      },
    },
    create: {
      shop: input.shop,
      identityKey: key,
      channel: input.channel,
      sessionId: input.sessionId ?? null,
      lastShownAt: now,
      sessionShownAt: now,
      windowStart,
      shownInWindow: 1,
    },
    update: {
      sessionId: input.sessionId ?? null,
      lastShownAt: now,
      sessionShownAt: now,
      windowStart,
      shownInWindow: shownInWindowNext,
    },
  });

  return decision;
}
