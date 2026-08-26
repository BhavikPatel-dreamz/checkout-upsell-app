import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import {
  deleteStaleVariants,
  syncProductsChunk,
} from "../models/productVariant.server";
import {
  failSyncRun,
  finishSyncRun,
  getSyncRun,
  pauseSyncRun,
  recordChunk,
  startSyncRun,
} from "../models/syncLog.server";

export async function productSyncAction({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "start");
  const productId = form.get("productId");

  console.info("[ProductSync] Started", { shop, intent, productId });

  if (intent === "product") {
    if (typeof productId !== "string" || !productId.trim()) {
      return { ok: false as const, error: "Missing product ID for sync." };
    }

    try {
      const { upserted, removed } = await import("../models/productVariant.server").then((m) =>
        m.syncProductById(admin, shop, productId, new Date()),
      );

      return {
        ok: true as const,
        done: true as const,
        productId,
        upserted,
        removed,
        message: "Product synced successfully.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product sync failed.";
      console.error("[ProductSync] Product sync failed", { shop, productId, message });
      return { ok: false as const, error: message };
    }
  }

  // Stop: freeze the run exactly where it is. No chunk is fetched here — the
  // checkpoint (upserted/cursor/pages) is whatever the last completed chunk's
  // recordChunk() call already persisted. Only the status flips to "paused"
  // so the next load shows it as resumable.
  if (intent === "stop") {
    const stopRunId = String(form.get("runId") ?? "");
    if (!stopRunId) {
      return { ok: false as const, error: "Missing runId for stop request." };
    }

    const existing = await getSyncRun(stopRunId);
    if (!existing || existing.shop !== shop) {
      return { ok: false as const, error: "Sync run not found." };
    }

    await pauseSyncRun(stopRunId);
    console.info("[ProductSync] Paused", {
      shop,
      runId: stopRunId,
      processed: existing.upserted,
      cursor: existing.cursor,
    });

    return {
      ok: true as const,
      done: true as const,
      paused: true as const,
      runId: existing.id,
      startedAt: existing.startedAt.toISOString(),
      estimated: existing.estimated,
      cursor: existing.cursor,
      upserted: existing.upserted,
      removed: 0,
      pages: existing.pages,
    };
  }

  let openRunId: string | null =
    typeof form.get("runId") === "string" ? String(form.get("runId")) : null;

  try {
    let runId: string;
    let startedAt: Date;
    let estimated: number | null;
    let upsertedSoFar: number;
    let pagesSoFar: number;
    let cursor: string | null;

    if (intent === "start") {
      const run = await startSyncRun(shop);
      runId = run.runId;
      startedAt = run.startedAt;
      estimated = run.estimated;
      upsertedSoFar = 0;
      pagesSoFar = 0;
      cursor = null;
      openRunId = runId;
    } else if (intent === "resume") {
      const resumeRunId = String(form.get("runId") ?? "");
      if (!resumeRunId) throw new Error("Missing runId for resume request.");

      const existing = await getSyncRun(resumeRunId);
      if (!existing || existing.shop !== shop) {
        return { ok: false as const, error: "Sync run not found." };
      }
      // "running" = interrupted mid-loop (refresh/close without clicking Stop).
      // "paused"  = explicitly stopped by the user. Both resume the SAME run
      // from the SAME persisted cursor — never a new run, never cursor: null.
      if (existing.status !== "running" && existing.status !== "paused") {
        return { ok: false as const, error: "This sync run can no longer be resumed." };
      }

      runId = existing.id;
      startedAt = existing.startedAt;
      estimated = existing.estimated;
      upsertedSoFar = existing.upserted;
      pagesSoFar = existing.pages;
      cursor = existing.cursor;
      openRunId = runId;
    } else {
      if (!openRunId) throw new Error("Missing runId for chunk request.");
      runId = openRunId;
      startedAt = new Date(String(form.get("startedAt")));
      estimated = form.get("estimated") ? Number(form.get("estimated")) : null;
      upsertedSoFar = Number(form.get("upserted") ?? 0);
      pagesSoFar = Number(form.get("pages") ?? 0);
      cursor = form.get("cursor") ? String(form.get("cursor")) : null;
    }

    const chunk = await syncProductsChunk(admin, shop, { cursor, syncedAt: startedAt });
    // Only reached once syncProductsChunk's internal $transaction has fully
    // committed every variant in this chunk — THIS is the "chunk completed"
    // moment. The checkpoint is only ever advanced here, never earlier.
    await recordChunk(runId, { upserted: chunk.upserted, pages: 1, cursor: chunk.nextCursor });

    console.info("[ProductSync] Chunk complete", {
      shop,
      runId,
      upserted: chunk.upserted,
      done: chunk.done,
      nextCursor: chunk.nextCursor,
    });

    const upserted = upsertedSoFar + chunk.upserted;
    const pages = pagesSoFar + 1;
    const startedAtISO = startedAt.toISOString();

    if (chunk.done) {
      const removed = await deleteStaleVariants(shop, startedAt);
      await finishSyncRun(runId, { removed });
      console.info("[ProductSync] Completed", {
        shop,
        runId,
        removed,
        totalUpserted: upsertedSoFar + chunk.upserted,
      });
      return {
        ok: true as const,
        done: true as const,
        runId,
        startedAt: startedAtISO,
        estimated,
        cursor: null,
        upserted,
        removed,
        pages,
      };
    }

    return {
      ok: true as const,
      done: false as const,
      runId,
      startedAt: startedAtISO,
      estimated,
      cursor: chunk.nextCursor,
      upserted,
      removed: 0,
      pages,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Product sync failed.";
    console.error("[ProductSync] Failed", { shop, message });
    if (openRunId) {
      await failSyncRun(openRunId, message).catch(() => {});
    }
    return { ok: false as const, error: message };
  }
}