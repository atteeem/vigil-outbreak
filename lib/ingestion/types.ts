import type { FailureKind } from "./errors";

export interface FetchedItem {
  externalId: string | null;
  url: string;
  title: string;
  /** Plain text body/summary used for extraction. */
  text: string;
  publishedAt: Date;
  language: string | null;
  raw: unknown;
  /** The publisher's own summary/lead (used to locate the event); falls back to `text`. */
  lead?: string | null;
  /** Publisher-supplied type hints, e.g. CDC mediaType ("Podcast", "Video"). */
  hints?: string[];
}

export interface AdapterResult {
  httpStatus: number;
  items: FetchedItem[];
  /** Items that were present upstream but could not be parsed (kept for the run log). */
  itemErrors: string[];
  /** Number of upstream pages requested. */
  pages?: number;
}

export interface FetchOptions {
  /** Maximum number of upstream pages to follow (default 1: newest page only). */
  maxPages?: number;
}

export class IngestionError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
    readonly kind: FailureKind = "UNKNOWN",
    /** Server-requested delay (Retry-After), if any. */
    readonly retryAfterMs: number | null = null,
    /** Diagnostic excerpt of the response (shape summary or body start) for SCHEMA_MISMATCH and similar. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = "IngestionError";
  }
}
