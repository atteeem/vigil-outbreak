// Bundled basemap geometry (world-atlas 50m), shared by the WebGL map and the SVG fallback.
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

// world-atlas rings use d3's spherical (clockwise) winding; planar renderers need RFC 7946 winding (exterior
// counter-clockwise), otherwise large polygons fill inside-out.
function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  return a / 2;
}
function rewindPolygon(rings: number[][][]): number[][][] {
  return rings.map((r, i) => {
    const ccw = ringArea(r) > 0;
    return (i === 0) === ccw ? r : [...r].reverse();
  });
}
/** Rings that cross the antimeridian (Russia's Chukotka, Fiji) jump from +180 to -180 and would draw a band
 * around the whole world in a planar projection: shift their western points by +360 so the ring stays continuous. */
function unwrapPolygon(rings: number[][][]): number[][][] {
  return rings.map((r) => {
    const xs = r.map((c) => c[0]!);
    if (Math.max(...xs) - Math.min(...xs) <= 180) return r;
    return r.map(([x, y]) => [x! < 0 ? x! + 360 : x!, y!]);
  });
}
function rewindCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  // Antarctica legitimately spans every longitude and has no outbreak relevance; drop it rather than draw a cap.
  fc.features = fc.features.filter((f) => (f.properties as { name?: string } | null)?.name !== "Antarctica");
  for (const f of fc.features) {
    const g = f.geometry;
    if (g?.type === "Polygon") g.coordinates = unwrapPolygon(g.coordinates);
    else if (g?.type === "MultiPolygon") g.coordinates = g.coordinates.map(unwrapPolygon);
    if (g?.type === "Polygon") g.coordinates = rewindPolygon(g.coordinates);
    else if (g?.type === "MultiPolygon") g.coordinates = g.coordinates.map(rewindPolygon);
  }
  return fc;
}

/** Splits mesh lines at antimeridian jumps (which would draw a horizontal line across the world) and drops
 * Antarctic coastline segments. */
function cleanLines(g: GeoJSON.MultiLineString): GeoJSON.MultiLineString {
  const out: number[][][] = [];
  for (const line of g.coordinates) {
    let cur: number[][] = [];
    for (let i = 0; i < line.length; i++) {
      const pt = line[i]!;
      const prev = line[i - 1];
      if (pt[1]! < -60 || (prev && Math.abs(pt[0]! - prev[0]!) > 180)) {
        if (cur.length > 1) out.push(cur);
        cur = pt[1]! < -60 ? [] : [pt];
        continue;
      }
      cur.push(pt);
    }
    if (cur.length > 1) out.push(cur);
  }
  return { type: "MultiLineString", coordinates: out };
}

export type Geography = { land: GeoJSON.FeatureCollection; borders: GeoJSON.FeatureCollection };

let geoPromise: Promise<Geography> | null = null;
export function loadGeography(): Promise<Geography> {
  geoPromise ??= fetch("/geo/countries-50m.json")
    .then((r) => {
      if (!r.ok) throw new Error(`basemap geometry HTTP ${r.status}`);
      return r.json();
    })
    .then((topo: Topology) => {
      const countries = topo.objects.countries as GeometryCollection;
      const land = rewindCollection(feature(topo, countries) as unknown as GeoJSON.FeatureCollection);
      const interior = cleanLines(mesh(topo, countries, (a, b) => a !== b));
      const coast = cleanLines(mesh(topo, countries, (a, b) => a === b));
      return {
        land,
        borders: { type: "FeatureCollection", features: [
          { type: "Feature", properties: { kind: "border" }, geometry: interior },
          { type: "Feature", properties: { kind: "coast" }, geometry: coast },
        ] } as GeoJSON.FeatureCollection,
      };
    })
    .catch((err) => {
      geoPromise = null;
      throw err;
    });
  return geoPromise;
}
