import type { MapMarker } from "@/components/map/outbreak-map";
import type { OutbreakSummaryDTO } from "@/lib/server/queries";

/** One marker per outbreak site; an outbreak's sites closer than ~80 km are merged so a single investigation
 * (e.g. Irkutsk + Shelekhov) never reads as two separate events or a cluster of "2". */
export function markersFor(outbreaks: readonly Pick<OutbreakSummaryDTO, "id" | "slug" | "title" | "classification" | "locations" | "cases">[]): MapMarker[] {
  const out: MapMarker[] = [];
  for (const o of outbreaks) {
    const groups: { lat: number; lng: number; names: string[]; precision: string }[] = [];
    for (const l of o.locations) {
      const g = groups.find((x) => Math.hypot(x.lat - l.lat, (x.lng - l.lng) * Math.cos((l.lat * Math.PI) / 180)) < 0.75);
      if (g) g.names.push(l.name);
      else groups.push({ lat: l.lat, lng: l.lng, names: [l.name], precision: l.precision });
    }
    groups.forEach((g, i) => out.push({ id: `${o.id}-${i}`, slug: o.slug, title: o.title, classification: o.classification, lat: g.lat, lng: g.lng, precision: g.precision, locationName: g.names.join(" / "), confirmedCases: o.cases.confirmedCases }));
  }
  return out;
}
