// Starts the ingestion scheduler once per server process (dev and production). Disable with
// DISABLE_INGESTION_SCHEDULER=1 (the Playwright suite does, and drives ingestion explicitly).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Node tries IPv6 first; on IPv4-only networks every dual-stack host then burns the full connect timeout
    // (observed in VIGIL against who.int). Prefer IPv4.
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
    const off = process.env.DISABLE_INGESTION_SCHEDULER;
    if (off !== "1" && off !== "true") {
      const { startScheduler } = await import("@/lib/ingestion/scheduler");
      startScheduler(60_000);
    }
  }
}
