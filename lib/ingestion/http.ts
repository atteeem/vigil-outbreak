import { IngestionError } from "./types";
import { classifyFetchError, classifyHttpStatus, isPolicyDenial, type FailureKind } from "./errors";

export function userAgent(): string {
  const contact = process.env.INGESTION_CONTACT?.trim();
  return `VIGIL-OUTBREAK/0.1 (public-health monitoring; ${contact || "local deployment"})`;
}

export interface FetchTextResult {
  status: number;
  body: string;
  contentType: string;
  finalUrl: string;
}

/** Failure classes worth retrying within a run. Policy blocks, auth, 404, client errors and schema changes are not:
 * retrying cannot fix them and would only hammer the publisher. */
export const TRANSIENT_KINDS = new Set<FailureKind>(["TIMEOUT", "CONNECTION", "HTTP_SERVER", "HTTP_RATE_LIMITED"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseRetryAfter(v: string | null): number | null {
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/** GET with retries for transient failures: up to INGESTION_RETRIES extra attempts (default 2) with exponential
 * backoff from INGESTION_RETRY_BASE_MS (default 1000 ms, ×4 each time, ±20% jitter), honouring Retry-After up to
 * 60 s. Every failure surfaces as a classified IngestionError; nothing is swallowed or substituted. */
export async function fetchText(url: string, accept: string): Promise<FetchTextResult> {
  const retries = Math.max(0, Number(process.env.INGESTION_RETRIES ?? 2));
  const baseMs = Math.max(0, Number(process.env.INGESTION_RETRY_BASE_MS ?? 1000));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchTextOnce(url, accept);
    } catch (err) {
      if (!(err instanceof IngestionError) || !TRANSIENT_KINDS.has(err.kind) || attempt >= retries) {
        if (err instanceof IngestionError && attempt > 0) err.message = `${err.message} (after ${attempt + 1} attempts)`;
        throw err;
      }
      const backoff = baseMs * 4 ** attempt * (0.8 + Math.random() * 0.4);
      await sleep(Math.min(60_000, err.retryAfterMs ?? backoff));
    }
  }
}

async function fetchTextOnce(url: string, accept: string): Promise<FetchTextResult> {
  const timeout = Number(process.env.INGESTION_FETCH_TIMEOUT_MS) || 20_000;
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    throw new IngestionError(`Invalid source URL: ${url}`, null, "CONFIG");
  }
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": userAgent(), accept }, signal: AbortSignal.timeout(timeout), cache: "no-store", redirect: "follow" });
  } catch (err) {
    const { kind, detail } = classifyFetchError(err);
    throw new IngestionError(`Network error fetching ${host}: ${kind === "TIMEOUT" ? `timed out after ${timeout} ms` : detail}`, null, kind);
  }
  const body = await res.text();
  if (!res.ok) {
    if (isPolicyDenial(res.status, res.headers, body)) {
      const reason = res.headers.get("x-deny-reason");
      throw new IngestionError(`Blocked by local network policy before reaching ${host} (proxy answered ${res.status}${reason ? `, ${reason}` : ""}): ${body.trim().slice(0, 160)}`, res.status, "NETWORK_POLICY_BLOCKED");
    }
    throw new IngestionError(`HTTP ${res.status} from ${host}`, res.status, classifyHttpStatus(res.status), parseRetryAfter(res.headers.get("retry-after")));
  }
  return { status: res.status, body, contentType: res.headers.get("content-type") ?? "", finalUrl: res.url || url };
}

export function parseJson(body: string, status: number, what: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new IngestionError(`${what} did not return JSON (got ${body.trim().slice(0, 60) || "empty body"})`, status, "SCHEMA_MISMATCH");
  }
}
