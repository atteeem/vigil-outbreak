// In-process scheduler started from instrumentation.ts (VIGIL pattern). Every tick it polls the sources that
// are due; each source has its own interval (default INGESTION_INTERVAL_MINUTES, 15). Runs are serialised.
import { runAll } from "./pipeline";

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
      const results = await runAll("SCHEDULED", { onlyDue: true });
      for (const r of results) {
        if (r.status !== "SKIPPED") console.log(`[ingest] ${r.sourceName}: ${r.status} new=${r.itemsNew} dup=${r.itemsDuplicate}${r.error ? ` error=${r.error}` : ""}`);
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
