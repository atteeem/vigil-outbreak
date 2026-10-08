// In-process scheduler (INGESTION_MODE=inline — the development default). Production should run ingestion
// outside the web process: `npm run worker` (long-running) or `npm run ingest -- --due` from cron.
import { ingestionTick } from "./tick";

const g = globalThis as unknown as { __outbreakScheduler?: { timer: NodeJS.Timeout; startedAt: Date; lastTickAt: Date | null; ticking: boolean } };

export function schedulerState() {
  const s = g.__outbreakScheduler;
  return s ? { running: true, startedAt: s.startedAt.toISOString(), lastTickAt: s.lastTickAt?.toISOString() ?? null } : { running: false, startedAt: null, lastTickAt: null };
}

export function startScheduler(tickMs = 60_000) {
  if (g.__outbreakScheduler) return;
  const state = { timer: null as unknown as NodeJS.Timeout, startedAt: new Date(), lastTickAt: null as Date | null, ticking: false };
  const tick = async () => {
    if (state.ticking) return;
    state.ticking = true;
    state.lastTickAt = new Date();
    try {
      const results = await ingestionTick("inline", state.startedAt);
      for (const r of results) {
        if (r.status !== "SKIPPED") console.log(`[ingest] ${r.sourceName}: ${r.status} new=${r.itemsNew} dup=${r.itemsDuplicate}${r.error ? ` ${r.failureKind}: ${r.error}` : ""}`);
      }
    } catch (err) {
      console.error("[ingest] scheduler tick failed:", err);
    } finally {
      state.ticking = false;
    }
  };
  state.timer = setInterval(tick, tickMs);
  state.timer.unref?.();
  g.__outbreakScheduler = state;
  setTimeout(tick, 5_000).unref?.();
}
