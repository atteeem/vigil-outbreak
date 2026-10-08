// Failure classification. The point is to never confuse "our sandbox/firewall would not let us out" with
// "the publisher rejected us" or "the publisher changed its format" — each needs a different fix.

export const FAILURE_KINDS = [
  "NETWORK_POLICY_BLOCKED", // a local/egress proxy refused the connection; the publisher never saw the request
  "PROXY_ERROR", // a proxy failed for another reason
  "DNS", // host name did not resolve
  "TIMEOUT",
  "CONNECTION", // refused / reset / unreachable
  "TLS", // certificate / handshake failure
  "HTTP_AUTH", // 401/403 returned by the publisher itself
  "HTTP_NOT_FOUND", // 404/410: endpoint moved or wrong URL
  "HTTP_RATE_LIMITED", // 429
  "HTTP_CLIENT", // other 4xx: malformed request
  "HTTP_SERVER", // 5xx at the publisher
  "SCHEMA_MISMATCH", // reachable, but the response is not the documented format
  "CONFIG", // no URL, unsupported adapter
  "UNKNOWN",
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export const FAILURE_LABEL: Record<FailureKind, string> = {
  NETWORK_POLICY_BLOCKED: "Blocked by local network policy",
  PROXY_ERROR: "Proxy error",
  DNS: "DNS resolution failed",
  TIMEOUT: "Timed out",
  CONNECTION: "Connection failed",
  TLS: "TLS / certificate error",
  HTTP_AUTH: "Rejected by publisher (401/403)",
  HTTP_NOT_FOUND: "Endpoint not found",
  HTTP_RATE_LIMITED: "Rate limited",
  HTTP_CLIENT: "Request rejected (4xx)",
  HTTP_SERVER: "Publisher server error (5xx)",
  SCHEMA_MISMATCH: "Unexpected response format",
  CONFIG: "Source misconfigured",
  UNKNOWN: "Unknown failure",
};

export const FAILURE_HINT: Record<FailureKind, string> = {
  NETWORK_POLICY_BLOCKED: "The request never reached the publisher. Allow the host in this environment's egress/firewall settings, or run ingestion from a network with normal internet access.",
  PROXY_ERROR: "Check HTTPS_PROXY / corporate proxy configuration.",
  DNS: "Check DNS / internet connectivity and the host name in the source URL.",
  TIMEOUT: "The host did not answer in time. Retry later or raise INGESTION_FETCH_TIMEOUT_MS.",
  CONNECTION: "The host refused or reset the connection. Check connectivity and firewalls.",
  TLS: "Certificate validation failed. If behind an inspecting proxy, set NODE_EXTRA_CA_CERTS.",
  HTTP_AUTH: "The publisher refused access. Check the URL, required headers, and the source's terms.",
  HTTP_NOT_FOUND: "The endpoint path is wrong or has moved. Re-check the publisher's documentation.",
  HTTP_RATE_LIMITED: "Back off; increase the polling interval.",
  HTTP_CLIENT: "The request was malformed for this endpoint (query parameters?).",
  HTTP_SERVER: "Publisher-side error; usually transient.",
  SCHEMA_MISMATCH: "The endpoint answered but not in the documented format. The adapter needs review before data is trusted.",
  CONFIG: "Fix the source configuration in /admin.",
  UNKNOWN: "See the error message.",
};

/** Proxies in managed sandboxes answer blocked hosts with a synthetic 403/407. Those must not be reported as the
 * publisher refusing us. Signals: an explicit deny header, or a deny message naming an allowlist / egress policy. */
export function isPolicyDenial(status: number, headers: Headers | Record<string, string | null | undefined>, body: string): boolean {
  const get = (k: string) => (headers instanceof Headers ? headers.get(k) : (headers[k] ?? headers[k.toLowerCase()])) ?? null;
  if (get("x-deny-reason")) return true;
  if (status !== 403 && status !== 407 && status !== 451) return false;
  return /not in allowlist|egress|blocked by (the )?(network|proxy|policy|firewall)|host_not_allowed|access denied by policy/i.test(body.slice(0, 2000));
}

export function classifyHttpStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return "HTTP_AUTH";
  if (status === 404 || status === 410) return "HTTP_NOT_FOUND";
  if (status === 429) return "HTTP_RATE_LIMITED";
  if (status === 407) return "PROXY_ERROR";
  if (status >= 500) return "HTTP_SERVER";
  return "HTTP_CLIENT";
}

/** Classifies a thrown fetch() error (undici puts the system error in `cause`). */
export function classifyFetchError(err: unknown): { kind: FailureKind; detail: string } {
  const e = err as Error & { cause?: { code?: string; message?: string; cause?: { code?: string } } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return { kind: "TIMEOUT", detail: "timed out" };
  const code = e?.cause?.code ?? e?.cause?.cause?.code ?? "";
  const msg = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return { kind: "DNS", detail: code };
  if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT/.test(code)) return { kind: "TIMEOUT", detail: code };
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code) || /certificate/i.test(msg)) return { kind: "TLS", detail: code || "certificate error" };
  if (/tunnel|proxy/i.test(msg) && /403|407|forbidden/i.test(msg)) return { kind: "NETWORK_POLICY_BLOCKED", detail: msg.trim() };
  if (/tunnel|proxy/i.test(msg)) return { kind: "PROXY_ERROR", detail: msg.trim() };
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|UND_ERR_SOCKET/.test(code)) return { kind: "CONNECTION", detail: code };
  return { kind: "UNKNOWN", detail: code || msg.trim() || String(err) };
}

/** URLs that point at local fixtures/test servers never count as live ingestion. */
export function isLiveUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return !(h === "localhost" || h.endsWith(".localhost") || /^127\./.test(h) || h === "::1" || h === "[::1]" || h === "0.0.0.0");
  } catch {
    return false;
  }
}
