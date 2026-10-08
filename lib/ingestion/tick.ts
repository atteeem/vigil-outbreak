// One ingestion pass + heartbeat. Shared by the in-process scheduler (INGESTION_MODE=inline), the standalone worker
// (`npm run worker`, INGESTION_MODE=worker) and cron (`npm run ingest -- --due`).
import { hostname } from "node:os";
import { prisma } from "@/lib/db";
import { runAll, type RunSummary, type Trigger } from "./pipeline";

export type HeartbeatMode = "inline" | "worker" | "cli";

export async function heartbeat(mode: HeartbeatMode, startedAt: Date, status: string) {
  const now = new Date();
  await prisma.workerHeartbeat.upsert({
    where: { id: mode },
    create: { id: mode, mode, host: hostname(), pid: process.pid, startedAt, lastTickAt: now, lastTickStatus: status, ticks: 1 },
    update: { host: hostname(), pid: process.pid, startedAt, lastTickAt: now, lastTickStatus: status, ticks: { increment: 1 } },
  });
}

export function summarize(results: RunSummary[]): string {
  const ran = results.filter((r) => r.status !== "SKIPPED");
  if (ran.length === 0) return "idle (no source due)";
  const failed = ran.filter((r) => r.status === "FAILED");
  const fresh = ran.reduce((n, r) => n + r.itemsNew, 0);
  return `${ran.length} source(s): ${ran.length - failed.length} ok, ${failed.length} failed${failed.length ? ` [${failed.map((f) => `${f.sourceName}: ${f.failureKind}`).join("; ")}]` : ""}, ${fresh} new`;
}

export async function ingestionTick(mode: HeartbeatMode, startedAt: Date, opts: { onlyDue?: boolean; maxPages?: number } = {}): Promise<RunSummary[]> {
  const trigger: Trigger = mode === "cli" ? "CLI" : "SCHEDULED";
  let results: RunSummary[] = [];
  try {
    results = await runAll(trigger, { onlyDue: opts.onlyDue ?? true, maxPages: opts.maxPages });
    await heartbeat(mode, startedAt, summarize(results));
  } catch (err) {
    await heartbeat(mode, startedAt, `tick error: ${(err as Error).message}`).catch(() => undefined);
    throw err;
  }
  return results;
}
