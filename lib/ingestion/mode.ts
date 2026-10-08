/** Where scheduled ingestion runs.
 *  inline — in the Next.js server process (development default; single-process installs)
 *  worker — a separate `npm run worker` process or cron `npm run ingest -- --due` (production default)
 *  off    — no scheduled ingestion (tests; manual Fetch Now still works) */
export type IngestionMode = "inline" | "worker" | "off";

export function ingestionMode(env: Record<string, string | undefined> = process.env): IngestionMode {
  const legacy = env.DISABLE_INGESTION_SCHEDULER;
  if (legacy === "1" || legacy === "true") return "off";
  const m = env.INGESTION_MODE?.trim().toLowerCase();
  if (m === "inline" || m === "worker" || m === "off") return m;
  return env.NODE_ENV === "production" ? "worker" : "inline";
}
