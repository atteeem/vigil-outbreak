// Enum vocabularies (SQLite stores them as strings; this is the validation boundary).

export const CLASSIFICATIONS = [
  "UNCONFIRMED_INVESTIGATION",
  "SUSPECTED_OUTBREAK",
  "CONFIRMED_LOCALIZED",
  "CONFIRMED_WIDESPREAD",
  "RESOLVED",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  UNCONFIRMED_INVESTIGATION: "Unconfirmed investigation",
  SUSPECTED_OUTBREAK: "Suspected outbreak",
  CONFIRMED_LOCALIZED: "Confirmed · localized",
  CONFIRMED_WIDESPREAD: "Confirmed · widespread",
  RESOLVED: "Resolved",
};

// Classification colours communicate evidence status, not severity: investigations are cool/neutral hues,
// confirmed events warm, resolved grey. Mirrored in app/globals.css (--color-cls-*).
export const CLASSIFICATION_HEX: Record<Classification, string> = {
  UNCONFIRMED_INVESTIGATION: "#7aa7ff",
  SUSPECTED_OUTBREAK: "#c79bff",
  CONFIRMED_LOCALIZED: "#f2b84b",
  CONFIRMED_WIDESPREAD: "#f07a4b",
  RESOLVED: "#7d8794",
};

export const isInvestigation = (c: string) => c === "UNCONFIRMED_INVESTIGATION" || c === "SUSPECTED_OUTBREAK";
export const isConfirmedActive = (c: string) => c === "CONFIRMED_LOCALIZED" || c === "CONFIRMED_WIDESPREAD";

export const PATHOGEN_STATUSES = ["UNKNOWN", "UNDER_INVESTIGATION", "SUSPECTED", "CONFIRMED", "RULED_OUT"] as const;
export type PathogenStatus = (typeof PATHOGEN_STATUSES)[number];
export const PATHOGEN_STATUS_LABEL: Record<PathogenStatus, string> = {
  UNKNOWN: "Unknown",
  UNDER_INVESTIGATION: "Under laboratory investigation",
  SUSPECTED: "Suspected, not confirmed",
  CONFIRMED: "Laboratory confirmed",
  RULED_OUT: "Suspected pathogen ruled out",
};

export const METRICS = [
  "CONFIRMED_CASES",
  "PROBABLE_CASES",
  "SUSPECTED_CASES",
  "DEATHS",
  "UNDER_OBSERVATION",
  "HOSPITALIZED",
  "CONTACTS_TESTED_NEGATIVE",
] as const;
export type Metric = (typeof METRICS)[number];
export const METRIC_LABEL: Record<Metric, string> = {
  CONFIRMED_CASES: "Confirmed cases",
  PROBABLE_CASES: "Probable cases",
  SUSPECTED_CASES: "Suspected cases",
  DEATHS: "Deaths",
  UNDER_OBSERVATION: "Under observation",
  HOSPITALIZED: "Hospitalized / isolated in hospital",
  CONTACTS_TESTED_NEGATIVE: "Contacts tested negative",
};
/** Metrics that count people with infection. Observation / contact metrics are NOT infections. */
export const CASE_METRICS: readonly Metric[] = ["CONFIRMED_CASES", "PROBABLE_CASES", "SUSPECTED_CASES"];

export const SOURCE_TYPES = ["OFFICIAL", "MEDIA"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const VERIFICATION_STATUSES = ["UNVERIFIED", "VERIFIED", "DISPUTED", "REFUTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const VERIFICATION_LABEL: Record<string, string> = {
  UNVERIFIED: "Unverified",
  VERIFIED: "Verified",
  DISPUTED: "Disputed",
  REFUTED: "Refuted",
  RETRACTED: "Retracted",
};

export const REVIEW_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "DUPLICATE"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const GEO_PRECISIONS = ["EXACT", "CITY", "ADMIN1", "COUNTRY", "UNKNOWN"] as const;
export type GeoPrecision = (typeof GEO_PRECISIONS)[number];

export { LOCATION_ROLES } from "@/lib/tracked/timeline";

export const UPDATE_KINDS = ["DEVELOPMENT", "OFFICIAL_STATEMENT", "MEASURE", "CORRECTION", "RECLASSIFICATION", "MEDIA_REPORT"] as const;
export const UPDATE_KIND_LABEL: Record<string, string> = {
  DEVELOPMENT: "Development",
  OFFICIAL_STATEMENT: "Official statement",
  MEASURE: "Precautionary measure",
  CORRECTION: "Correction",
  RECLASSIFICATION: "Reclassification",
  MEDIA_REPORT: "Media report",
};

export const RISK_LEVELS = ["VERY_LOW", "LOW", "LOW_TO_MODERATE", "MODERATE", "HIGH", "VERY_HIGH", "NOT_ASSESSED"] as const;
export const RISK_LABEL: Record<string, string> = {
  VERY_LOW: "Very low",
  LOW: "Low",
  LOW_TO_MODERATE: "Low to moderate",
  MODERATE: "Moderate",
  HIGH: "High",
  VERY_HIGH: "Very high",
  NOT_ASSESSED: "Not assessed",
};

export const CLAIM_TYPES = ["CASE_COUNT", "DEATH", "OBSERVATION_COUNT", "PATHOGEN_ID", "RISK_ASSESSMENT", "MEASURE", "STATEMENT", "LOCATION", "OTHER"] as const;

export const SOURCE_KINDS = ["OFFICIAL", "MEDIA", "AGGREGATOR"] as const;
export const ADAPTERS = ["WHO_DON_API", "CDC_CONTENT_API", "RSS", "MANUAL"] as const;
export type AdapterId = (typeof ADAPTERS)[number];

export function oneOf<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
