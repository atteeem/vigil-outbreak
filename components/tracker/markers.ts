// Map markers for the tracked investigation: one per analyst-VERIFIED location, symbolised by its role.
// Unverified locations are listed beside the map but never drawn.
import type { MapMarker, MarkerKind } from "@/components/map/outbreak-map";
import type { TrackerDTO, TrackerLocation } from "@/lib/server/tracker";

const KIND: Partial<Record<string, MarkerKind>> = {
  INVESTIGATION_SITE: "investigation",
  SUSPECTED_CASE: "suspected",
  CONFIRMED_CASE: "confirmed",
  PRECAUTIONARY_MEASURE: "precaution",
};

export const mappable = (l: TrackerLocation) => l.verificationStatus === "VERIFIED";

export function locationMarkers(t: Pick<TrackerDTO, "locations" | "status" | "event">): MapMarker[] {
  return t.locations.filter(mappable).map((l) => ({
    id: l.id,
    slug: t.event.slug,
    title: t.status?.title ?? t.event.name,
    classification: t.status?.classification ?? "UNCONFIRMED_INVESTIGATION",
    kind: KIND[l.role],
    label: l.roleLabel,
    lat: l.lat,
    lng: l.lng,
    precision: l.precision,
    locationName: l.name,
    confirmedCases: null,
  }));
}
