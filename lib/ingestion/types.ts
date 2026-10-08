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
  ) {
    super(message);
    this.name = "IngestionError";
  }
}
