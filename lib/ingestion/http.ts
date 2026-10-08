import { IngestionError } from "./types";

export function userAgent(): string {
  const contact = process.env.INGESTION_CONTACT?.trim();
  return `VIGIL-OUTBREAK/0.1 (public-health monitoring; ${contact || "local deployment"})`;
}

/** GET with a hard timeout; non-2xx responses and network failures throw IngestionError (never swallowed). */
export async function fetchText(url: string, accept: string): Promise<{ status: number; body: string; contentType: string }> {
  const timeout = Number(process.env.INGESTION_FETCH_TIMEOUT_MS) || 20_000;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": userAgent(), accept }, signal: AbortSignal.timeout(timeout), cache: "no-store", redirect: "follow" });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const detail = e.name === "TimeoutError" ? `timed out after ${timeout} ms` : e.cause?.code || e.cause?.message || e.message;
    throw new IngestionError(`Network error fetching ${new URL(url).host}: ${detail}`);
  }
  const body = await res.text();
  if (!res.ok) throw new IngestionError(`HTTP ${res.status} from ${new URL(url).host}`, res.status);
  return { status: res.status, body, contentType: res.headers.get("content-type") ?? "" };
}
