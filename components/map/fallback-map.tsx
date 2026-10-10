"use client";

// Static SVG world map used when the WebGL map cannot run (no WebGL2 — hardware acceleration off, GPU on the
// browser's blocklist, remote desktop / VM — or the MapLibre worker failed to load). Same bundled geography, same
// marker semantics and click-to-select; no pan/zoom, satellite or clustering.

import { useEffect, useMemo, useState } from "react";
import { CLASSIFICATION_LABEL, type Classification } from "@/lib/domain/enums";
import { CITIES } from "@/lib/geo/cities";
import { loadGeography, type Geography } from "./geography";
import { markerColor, markerKind } from "./marker-style";
import type { MapMarker } from "./outbreak-map";

const W = 1000;
const H = 500;
const x = (lng: number) => ((lng + 180) / 360) * W;
const y = (lat: number) => ((90 - lat) / 180) * H;

function ringsPath(rings: number[][][]): string {
  return rings.map((r) => "M" + r.map(([lng, lat]) => `${x(lng!).toFixed(1)},${y(lat!).toFixed(1)}`).join("L") + "Z").join("");
}
function linesPath(lines: number[][][]): string {
  return lines.map((l) => "M" + l.map(([lng, lat]) => `${x(lng!).toFixed(1)},${y(lat!).toFixed(1)}`).join("L")).join("");
}

function toPaths(g: Geography) {
  let land = "";
  for (const f of g.land.features) {
    const geom = f.geometry;
    if (geom?.type === "Polygon") land += ringsPath(geom.coordinates);
    else if (geom?.type === "MultiPolygon") for (const p of geom.coordinates) land += ringsPath(p);
  }
  const lines = (kind: string) => {
    const geom = g.borders.features.find((f) => (f.properties as { kind?: string } | null)?.kind === kind)?.geometry;
    return geom?.type === "MultiLineString" ? linesPath(geom.coordinates) : "";
  };
  return { land, borders: lines("border"), coast: lines("coast") };
}

/** Same scale as the WebGL map: only official verified confirmed cases change the size. */
const radius = (cases: number | null) => (cases === null ? 7 : Math.min(24, 7 + 3.2 * Math.log10(cases + 1)));

export function FallbackMap({
  markers,
  selectedSlug,
  selectedId,
  onSelect,
  onSelectMarker,
  reason,
  view,
}: {
  markers: readonly MapMarker[];
  selectedSlug?: string | null;
  selectedId?: string | null;
  onSelect?: (slug: string) => void;
  onSelectMarker?: (id: string) => void;
  reason: string;
  view?: { center: [number, number]; zoom: number };
}) {
  const [paths, setPaths] = useState<{ land: string; borders: string; coast: string } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadGeography()
      .then((g) => alive && setPaths(toPaths(g)))
      .catch((e: Error) => alive && setGeoError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const vb = useMemo(() => {
    // World view: 84°N to 60°S. Regional views (outbreak pages) crop around the requested centre.
    if (!view || view.zoom <= 2) return { x: 0, y: y(84), w: W, h: y(-60) - y(84) };
    const lngSpan = Math.min(360, 720 / 2 ** view.zoom);
    const w = (lngSpan / 360) * W;
    const h = w / 2;
    return { x: x(view.center[0]) - w / 2, y: y(view.center[1]) - h / 2, w, h };
  }, [view]);
  const k = vb.w / W;

  return (
    <div className="absolute inset-0 flex flex-col" data-testid="fallback-map">
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label="Static world map of outbreaks and investigations">
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#080b0f" />
        {paths && (
          <g data-testid="fallback-basemap">
            <path d={paths.land} fill="#12161b" fillRule="evenodd" />
            <path d={paths.coast} fill="none" stroke="#2b3540" strokeWidth={0.6 * k} />
            <path d={paths.borders} fill="none" stroke="#36414d" strokeWidth={0.5 * k} />
          </g>
        )}
        <g aria-hidden="true">
          {CITIES.filter((c) => c.rank === 1).map((c) => (
            <g key={c.name}>
              <circle cx={x(c.lng)} cy={y(c.lat)} r={1.6 * k} fill="#8a95a1" opacity={0.8} />
              <text x={x(c.lng) + 4 * k} y={y(c.lat) + 3 * k} fontSize={9 * k} fill="#a4adb8" stroke="#07080a" strokeWidth={2 * k} paintOrder="stroke">{c.name}</text>
            </g>
          ))}
        </g>
        {markers.map((m) => {
          const cls = m.classification as Classification;
          const hex = markerColor(m);
          const kind = markerKind(m);
          const op = m.muted ? 0.35 : 1;
          const choose = () => (onSelectMarker ? onSelectMarker(m.id) : onSelect?.(m.slug));
          const cx = x(m.lng);
          const cy = y(m.lat);
          const r = radius(m.confirmedCases) * k;
          const label = `${m.title} — ${m.label ?? CLASSIFICATION_LABEL[cls] ?? m.classification} · ${m.locationName}${m.precision === "COUNTRY" ? " (country-level location)" : ""}`;
          return (
            <g
              key={m.id}
              role="button"
              tabIndex={0}
              aria-label={label}
              data-testid={onSelectMarker ? `fallback-marker-${m.id}` : `fallback-marker-${m.slug}`}
              data-kind={kind}
              className="cursor-pointer outline-none"
              opacity={op}
              onClick={choose}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  choose();
                }
              }}
            >
              <title>{label}</title>
              {m.precision === "COUNTRY" && kind !== "precaution" && <circle cx={cx} cy={cy} r={r + 9 * k} fill={hex} fillOpacity={0.06} stroke={hex} strokeOpacity={0.22} strokeWidth={k} />}
              {kind === "precaution" ? (
                <circle cx={cx} cy={cy} r={15 * k} fill={hex} fillOpacity={0.07} stroke={hex} strokeOpacity={0.75} strokeWidth={1.5 * k} />
              ) : kind === "confirmed" ? (
                <circle cx={cx} cy={cy} r={r} fill={hex} fillOpacity={0.82} stroke="#07080a" strokeWidth={1.5 * k} />
              ) : kind === "suspected" ? (
                <circle cx={cx} cy={cy} r={8 * k} fill={hex} fillOpacity={0.08} stroke={hex} strokeWidth={2.5 * k} />
              ) : kind === "investigation" ? (
                <>
                  <circle cx={cx} cy={cy} r={9 * k} fill={hex} fillOpacity={0.08} stroke={hex} strokeWidth={2 * k} />
                  <circle cx={cx} cy={cy} r={2.2 * k} fill={hex} />
                </>
              ) : (
                <circle cx={cx} cy={cy} r={5.5 * k} fill="#7d8794" fillOpacity={0.05} stroke="#7d8794" strokeWidth={1.5 * k} />
              )}
              {(selectedId ? m.id === selectedId : m.slug === selectedSlug) && <circle cx={cx} cy={cy} r={r + 7 * k} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.5 * k} />}
            </g>
          );
        })}
      </svg>
      <p className="absolute left-2 right-2 top-10 z-10 max-w-md rounded-md border border-warn/40 bg-panel/95 px-2 py-1 text-[11px] text-warn" data-testid="map-fallback-notice">
        Simplified map: {reason}{geoError ? ` Basemap geometry failed to load (${geoError}).` : ""} Markers, selection and filters still work.
      </p>
    </div>
  );
}
