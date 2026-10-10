// Marker symbology shared by the WebGL map, the SVG fallback and server-rendered legends (plain module: no
// "use client", so server components get real values).
import { CLASSIFICATION_HEX, type Classification } from "@/lib/domain/enums";

/** investigation = inquiry site (ring + core); suspected = suspected case (ring); confirmed = laboratory-confirmed
 * (filled disc); precaution = quarantine/observation, never an infection (wide pale outline); resolved = grey ring. */
export type MarkerKind = "investigation" | "suspected" | "confirmed" | "precaution" | "resolved";
export const PRECAUTION_HEX = "#7fb2d9";

export function markerKind(m: { kind?: MarkerKind; classification: string }): MarkerKind {
  if (m.kind) return m.kind;
  if (m.classification === "CONFIRMED_LOCALIZED" || m.classification === "CONFIRMED_WIDESPREAD") return "confirmed";
  if (m.classification === "RESOLVED") return "resolved";
  if (m.classification === "SUSPECTED_OUTBREAK") return "suspected";
  return "investigation";
}
export function markerColor(m: { kind?: MarkerKind; classification: string }): string {
  const k = markerKind(m);
  if (k === "precaution") return PRECAUTION_HEX;
  if (k === "resolved") return "#7d8794";
  if (m.kind === "suspected") return CLASSIFICATION_HEX.SUSPECTED_OUTBREAK;
  if (m.kind === "confirmed") return CLASSIFICATION_HEX.CONFIRMED_LOCALIZED;
  if (m.kind === "investigation") return CLASSIFICATION_HEX.UNCONFIRMED_INVESTIGATION;
  return CLASSIFICATION_HEX[m.classification as Classification] ?? "#8d96a5";
}
