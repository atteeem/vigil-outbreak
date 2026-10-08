import { IngestionError } from "./types";
import { classifyFetchError, classifyHttpStatus, isPolicyDenial } from "./errors";

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

/** GET with a hard timeout. Every failure throws an IngestionError carrying a classified FailureKind; nothing is
 * swallowed and no fallback content is substituted. */
export async function fetchText(url: string, accept: string): Promise<FetchTextResult> {
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
    throw new IngestionError(`HTTP ${res.status} from ${host}`, res.status, classifyHttpStatus(res.status));
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
