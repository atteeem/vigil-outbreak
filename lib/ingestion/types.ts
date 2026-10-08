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
}

export class IngestionError extends Error {
  constructor(message: string, readonly httpStatus: number | null = null) {
    super(message);
    this.name = "IngestionError";
  }
}
