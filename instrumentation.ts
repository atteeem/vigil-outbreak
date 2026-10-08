// Starts the in-process ingestion scheduler when INGESTION_MODE=inline (development default). In production the
// default is INGESTION_MODE=worker: the web process only serves pages and ingestion runs in `npm run worker` or a
// cron job (`npm run ingest -- --due`). See docs/DEPLOYMENT.md.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Node tries IPv6 first; on IPv4-only networks every dual-stack host then burns the full connect timeout
    // (observed in VIGIL against who.int). Prefer IPv4.
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
    const { ingestionMode } = await import("@/lib/ingestion/mode");
    if (ingestionMode() === "inline") {
      const { startScheduler } = await import("@/lib/ingestion/scheduler");
      startScheduler(60_000);
    }
  }
}
