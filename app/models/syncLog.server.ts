// Sync-run history + progress state, shop-scoped. Keep this the only place that
// talks to Prisma for SyncLog rows (see AGENTS.md). Standard core — generic,
// config-free; no client-specific logic.

import db from "../db.server";

/**
 * Open a new sync run for a shop. First closes out any run still marked
 * `running` (a previous attempt the user abandoned mid-way — closed browser,
 * navigated off) as errored, so history stays truthful and only one run is ever
 * active. Then derives the progress denominator (`estimated`) from the last
 * successful run's variant count. Returns the identifiers the client threads
 * through each subsequent chunk.
 */
export async function startSyncRun(shop: string) {
  await db.syncLog.updateMany({
    where: { shop, status: "running" },
    data: { status: "error", error: "Interrupted", finishedAt: new Date() },
  });

  const lastSuccess = await db.syncLog.findFirst({
    where: { shop, status: "success" },
    orderBy: { startedAt: "desc" },
    select: { upserted: true },
  });

  const run = await db.syncLog.create({
    data: {
      shop,
      status: "running",
      estimated: lastSuccess?.upserted ?? null,
    },
    select: { id: true, startedAt: true, estimated: true },
  });

  return { runId: run.id, startedAt: run.startedAt, estimated: run.estimated };
}

/** Add one processed chunk's counts to a running run. */
/** Load one run's saved progress — used to resume after a refresh/tab switch. */
export async function getSyncRun(runId: string) {
  return db.syncLog.findUnique({
    where: { id: runId },
    select: {
      id: true,
      shop: true,
      status: true,
      startedAt: true,
      estimated: true,
      upserted: true,
      pages: true,
      cursor: true,
    },
  });
}

/** Add one processed chunk's counts to a running run. */
export async function recordChunk(
  runId: string,
  { upserted, pages, cursor }: { upserted: number; pages: number; cursor: string | null },
) {
  await db.syncLog.update({
    where: { id: runId },
    data: {
      upserted: { increment: upserted },
      pages: { increment: pages },
      cursor,
    },
  });
}

/** Mark a run successful and record how many stale rows were removed. */
export async function finishSyncRun(
  runId: string,
  { removed }: { removed: number },
) {
  await db.syncLog.update({
    where: { id: runId },
    data: { status: "success", removed, finishedAt: new Date() },
  });
}

/** Mark a run failed with an error message. */
export async function failSyncRun(runId: string, message: string) {
  await db.syncLog.update({
    where: { id: runId },
    data: {
      status: "error",
      error: message.slice(0, 1000),
      finishedAt: new Date(),
    },
  });
}

/** Mark a run paused (user clicked Stop). Does NOT touch the checkpoint —
 *  upserted/cursor/pages stay exactly as the last completed chunk left them,
 *  so this is purely a status flip, never a progress change. */
export async function pauseSyncRun(runId: string) {
  await db.syncLog.update({
    where: { id: runId },
    data: { status: "paused" },
  });
}

/** Recent sync runs for a shop, newest first — powers the dashboard log table. */
export function listSyncLogs(shop: string, take = 10) {
  return db.syncLog.findMany({
    where: { shop },
    orderBy: { startedAt: "desc" },
    take,
  });
}
