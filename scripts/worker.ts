// Standalone ingestion worker — production's recommended way to run scheduled ingestion outside the web process.
//   npm run worker                 polls due sources every WORKER_TICK_SECONDS (default 60)
//   npm run worker -- --once       one pass, then exit (same as `npm run ingest -- --due`, but with heartbeat mode "worker")
// Safe to run more than one instance: per-source database leases prevent concurrent fetches of the same source.
// Stops gracefully on Ctrl+C / SIGTERM (finishes the current pass, releases leases).
import "dotenv/config";
import dns from "node:dns";
import { prisma } from "../lib/db";
import { ingestionTick } from "../lib/ingestion/tick";

dns.setDefaultResultOrder("ipv4first");

const tickMs = Math.max(10, Number(process.env.WORKER_TICK_SECONDS) || 60) * 1000;
const once = process.argv.includes("--once");
const startedAt = new Date();
let stopping = false;
let wake: (() => void) | null = null;

function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal} received — finishing current pass, then exiting.`);
  wake?.();
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

async function main() {
  console.log(`[worker] started pid=${process.pid} tick=${tickMs / 1000}s db=${/^postgres/i.test(process.env.DATABASE_URL ?? "") ? "postgresql" : "sqlite"}`);
  while (!stopping) {
    const t0 = Date.now();
    try {
      const results = await ingestionTick("worker", startedAt);
      for (const r of results) if (r.status !== "SKIPPED") console.log(`[worker] ${new Date().toISOString()} ${r.sourceName}: ${r.status} new=${r.itemsNew} dup=${r.itemsDuplicate}${r.error ? ` ${r.failureKind}: ${r.error}` : ""}`);
      if (!results.some((r) => r.status !== "SKIPPED")) console.log(`[worker] ${new Date().toISOString()} idle — no source due`);
    } catch (err) {
      console.error("[worker] pass failed:", err);
    }
    if (once) break;
    await new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(resolve, Math.max(1000, tickMs - (Date.now() - t0)));
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
