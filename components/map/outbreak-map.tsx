"use client";

// Interactive outbreak map (MapLibre GL, VIGIL's map stack). The basemap is bundled and works offline: Natural
// Earth country polygons (world-atlas 50m) + a curated city gazetteer, rendered with self-hosted glyphs.
// Satellite mode overlays Esri World Imagery tiles (no key) beneath the same borders and labels.
//
// Visual language — classification, never severity:
//   investigation / suspected  -> hollow ring with a small core (location of an inquiry, not an infection zone)
//   confirmed localized / wide -> filled disc, sized only by an official verified confirmed-case count
//   resolved                    -> small grey ring
//   COUNTRY-precision points get a faint halo so they never read as a precise site.
// No areas are shaded: nothing on this map implies a geographic extent of infection.

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, NavigationControl, Popup, config as maplibreConfig, type GeoJSONSource, type MapLayerMouseEvent, type StyleSpecification, type ExpressionSpecification } from "maplibre-gl";
import { loadGeography } from "./geography";
import { FallbackMap } from "./fallback-map";
import { CLASSIFICATION_HEX, CLASSIFICATION_LABEL, type Classification } from "@/lib/domain/enums";
import { COUNTRIES } from "@/lib/geo/countries";
import { citiesGeoJSON } from "@/lib/geo/cities";
import { cn } from "@/lib/utils";
import { Layers, Satellite } from "lucide-react";

if (typeof window !== "undefined") {
  // Turbopack cannot resolve MapLibre's worker from import.meta.url (found in VIGIL); serve it from /public.
  maplibreConfig.WORKER_URL = "/maplibre-gl-worker.mjs";
}

const LOAD_TIMEOUT_MS = 20_000;

function supportsWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

export interface MapMarker {
  id: string;
  slug: string;
  title: string;
  classification: string;
  lat: number;
  lng: number;
  precision: string;
  locationName: string;
  /** Official verified confirmed cases, or null. Only this drives marker size. */
  confirmedCases: number | null;
}

export type BasemapMode = "map" | "satellite";
export const BASEMAP_PREF_KEY = "vigil-outbreak.basemap";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const countryLabels: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: COUNTRIES.map((c) => ({ type: "Feature", properties: { name: c.name }, geometry: { type: "Point", coordinates: [c.lng, c.lat] } })),
};

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "/fonts/{fontstack}/{range}.pbf",
    sources: {
      satellite: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 17, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
      land: { type: "geojson", data: EMPTY, attribution: "Borders: Natural Earth via world-atlas" },
      borders: { type: "geojson", data: EMPTY },
      countryLabels: { type: "geojson", data: countryLabels },
      cities: { type: "geojson", data: citiesGeoJSON() },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": "#080b0f" } },
      { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" }, paint: { "raster-opacity": 0.92, "raster-saturation": -0.25, "raster-brightness-max": 0.85 } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": "#12161b" } },
      { id: "coast", type: "line", source: "borders", filter: ["==", ["get", "kind"], "coast"], paint: { "line-color": "#2b3540", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 6, 1.1] } },
      { id: "borders", type: "line", source: "borders", filter: ["==", ["get", "kind"], "border"], paint: { "line-color": "#36414d", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 6, 1] } },
      {
        id: "country-labels", type: "symbol", source: "countryLabels",
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 1, 8.5, 5, 12], "text-transform": "uppercase", "text-letter-spacing": 0.1, "text-max-width": 7, "text-padding": 6 },
        paint: { "text-color": "#6b7682", "text-halo-color": "#07080a", "text-halo-width": 1.2, "text-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.75, 7, 0.35] },
      },
      {
        id: "city-dots", type: "circle", source: "cities",
        filter: ["any", ["==", ["get", "rank"], 1], ["all", ["==", ["get", "rank"], 2], [">=", ["zoom"], 3]], [">=", ["zoom"], 5]],
        paint: { "circle-radius": 1.8, "circle-color": "#8a95a1", "circle-opacity": 0.8 },
      },
      {
        id: "city-labels", type: "symbol", source: "cities",
        filter: ["any", ["==", ["get", "rank"], 1], ["all", ["==", ["get", "rank"], 2], [">=", ["zoom"], 3]], [">=", ["zoom"], 5]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 2, 9.5, 8, 13], "text-offset": [0.6, 0], "text-anchor": "left", "text-padding": 3 },
        paint: { "text-color": "#a4adb8", "text-halo-color": "#07080a", "text-halo-width": 1.2 },
      },
    ],
  };
}

const sizeExpr = ["case", ["has", "cases"], ["min", 24, ["+", 7, ["*", 3.2, ["log10", ["+", ["get", "cases"], 1]]]]], 7] as unknown as ExpressionSpecification;
const clsColor = ["match", ["get", "classification"], ...Object.entries(CLASSIFICATION_HEX).flat(), "#8d96a5"] as unknown as ExpressionSpecification;
const isConfirmed = ["in", ["get", "classification"], ["literal", ["CONFIRMED_LOCALIZED", "CONFIRMED_WIDESPREAD"]]] as unknown as ExpressionSpecification;
const isInvestigation = ["in", ["get", "classification"], ["literal", ["UNCONFIRMED_INVESTIGATION", "SUSPECTED_OUTBREAK"]]] as unknown as ExpressionSpecification;
const notCluster = ["!", ["has", "point_count"]] as unknown as ExpressionSpecification;

function addOutbreakLayers(map: MapLibreMap) {
  map.addSource("outbreaks", { type: "geojson", data: EMPTY, cluster: true, clusterRadius: 34, clusterMaxZoom: 3 });
  map.addLayer({ id: "cluster", type: "circle", source: "outbreaks", filter: ["has", "point_count"], paint: { "circle-color": "#1b232c", "circle-stroke-color": "#3fd0c9", "circle-stroke-width": 1.2, "circle-stroke-opacity": 0.6, "circle-radius": ["step", ["get", "point_count"], 13, 4, 16, 10, 20] } });
  map.addLayer({ id: "cluster-count", type: "symbol", source: "outbreaks", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Medium"], "text-size": 11, "text-allow-overlap": true }, paint: { "text-color": "#e6e9ee" } });
  map.addLayer({ id: "approx-halo", type: "circle", source: "outbreaks", filter: ["all", notCluster, ["==", ["get", "precision"], "COUNTRY"]], paint: { "circle-radius": ["+", sizeExpr, 9], "circle-color": clsColor, "circle-opacity": 0.06, "circle-stroke-color": clsColor, "circle-stroke-width": 1, "circle-stroke-opacity": 0.22 } });
  map.addLayer({ id: "confirmed", type: "circle", source: "outbreaks", filter: ["all", notCluster, isConfirmed], paint: { "circle-radius": sizeExpr, "circle-color": clsColor, "circle-opacity": 0.82, "circle-stroke-color": "#07080a", "circle-stroke-width": 1.5 } });
  map.addLayer({ id: "investigation", type: "circle", source: "outbreaks", filter: ["all", notCluster, isInvestigation], paint: { "circle-radius": 9, "circle-color": clsColor, "circle-opacity": 0.08, "circle-stroke-color": clsColor, "circle-stroke-width": 2 } });
  map.addLayer({ id: "investigation-core", type: "circle", source: "outbreaks", filter: ["all", notCluster, isInvestigation], paint: { "circle-radius": 2.2, "circle-color": clsColor } });
  map.addLayer({ id: "resolved", type: "circle", source: "outbreaks", filter: ["all", notCluster, ["==", ["get", "classification"], "RESOLVED"]], paint: { "circle-radius": 5.5, "circle-color": "#7d8794", "circle-opacity": 0.05, "circle-stroke-color": "#7d8794", "circle-stroke-width": 1.5 } });
  map.addLayer({ id: "selected", type: "circle", source: "outbreaks", filter: ["all", notCluster, ["==", ["get", "slug"], ""]], paint: { "circle-radius": ["+", sizeExpr, 7], "circle-color": "transparent", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.9 } });
  map.addLayer({ id: "marker-labels", type: "symbol", source: "outbreaks", filter: notCluster, minzoom: 3.5, layout: { "text-field": ["get", "locationName"], "text-font": ["Noto Sans Medium"], "text-size": 11, "text-offset": [0, 1.5], "text-anchor": "top", "text-optional": true }, paint: { "text-color": "#e6e9ee", "text-halo-color": "#07080a", "text-halo-width": 1.4 } });
}

const MARKER_LAYERS = ["confirmed", "investigation", "resolved", "approx-halo"];

function toGeoJSON(markers: readonly MapMarker[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers.map((m) => ({
      type: "Feature",
      id: undefined,
      properties: { id: m.id, slug: m.slug, title: m.title, classification: m.classification, precision: m.precision, locationName: m.locationName, ...(m.confirmedCases !== null ? { cases: m.confirmedCases } : {}) },
      geometry: { type: "Point", coordinates: [m.lng, m.lat] },
    })),
  };
}

export function OutbreakMap({
  markers,
  selectedSlug,
  onSelect,
  initialView = { center: [40, 25], zoom: 1.3 },
  focus,
  className,
  showLegend = true,
}: {
  markers: readonly MapMarker[];
  selectedSlug?: string | null;
  onSelect?: (slug: string) => void;
  initialView?: { center: [number, number]; zoom: number };
  /** When this changes, the camera flies to it. */
  focus?: { lng: number; lat: number; zoom: number; key: string } | null;
  className?: string;
  showLegend?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<BasemapMode>("map");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [satError, setSatError] = useState(false);
  // Set when the WebGL map cannot run; the SVG fallback then shows the same markers.
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only preference after mount
      if (localStorage.getItem(BASEMAP_PREF_KEY) === "satellite") setMode("satellite");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL2()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability detected only in the browser
      setEngineError("this browser has no WebGL2 (hardware acceleration is off, the GPU driver is blocked, or this is a remote desktop/VM session). Turn on \"Use graphics acceleration when available\" in the browser settings and restart it for the interactive map.");
      return;
    }
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
      container: containerRef.current,
      style: buildStyle(),
      center: initialView.center,
      // Phones see the whole world at a lower zoom.
      zoom: initialView.zoom <= 1.5 && containerRef.current.clientWidth < 640 ? 0.3 : initialView.zoom,
      minZoom: 0.2,
      maxZoom: 14,
      attributionControl: { compact: true },
      renderWorldCopies: true,
      dragRotate: false,
      pitchWithRotate: false,
      });
    } catch (err) {
      setEngineError(`the interactive map could not start (${(err as Error).message.slice(0, 160)}).`);
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    if (process.env.NODE_ENV !== "production") (window as unknown as { __outbreakMap?: MapLibreMap }).__outbreakMap = map;
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: "260px" });

    let lastError: string | null = null;
    map.on("error", (e) => {
      const src = (e as unknown as { sourceId?: string }).sourceId;
      if (src === "satellite") setSatError(true);
      else lastError = e.error?.message ?? String(e.error ?? "unknown error");
    });
    // MapLibre never fires "load" if its worker (/maplibre-gl-worker.mjs + /maplibre-gl-shared.mjs) cannot start,
    // which used to leave an empty map with no explanation.
    const watchdog = window.setTimeout(() => {
      if (map.loaded() || map.isStyleLoaded()) return;
      setEngineError(`the map engine did not start within ${LOAD_TIMEOUT_MS / 1000} s${lastError ? ` (${lastError.slice(0, 160)})` : " (its worker script /maplibre-gl-worker.mjs may be blocked or out of date)"}.`);
    }, LOAD_TIMEOUT_MS);

    map.on("load", () => {
      window.clearTimeout(watchdog);
      addOutbreakLayers(map);
      loadGeography()
        .then((g) => {
          (map.getSource("land") as GeoJSONSource | undefined)?.setData(g.land);
          (map.getSource("borders") as GeoJSONSource | undefined)?.setData(g.borders);
        })
        .catch((err: Error) => setGeoError(err.message));
      setReady(true);
    });

    for (const layer of MARKER_LAYERS) {
      map.on("mouseenter", layer, (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        const el = document.createElement("div");
        const title = document.createElement("div");
        title.className = "font-medium";
        title.textContent = p.title ?? "";
        const meta = document.createElement("div");
        meta.className = "mt-0.5 text-[11px] text-ink-dim";
        meta.textContent = `${CLASSIFICATION_LABEL[p.classification as Classification] ?? p.classification} · ${p.locationName}${p.precision === "COUNTRY" ? " (country-level location)" : ""}`;
        el.append(title, meta);
        popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setDOMContent(el).addTo(map);
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", layer, (e: MapLayerMouseEvent) => {
        const slug = (e.features?.[0]?.properties as { slug?: string } | undefined)?.slug;
        if (slug) onSelectRef.current?.(slug);
      });
    }
    map.on("click", "cluster", async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const src = map.getSource("outbreaks") as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(f.properties!.cluster_id as number);
      map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5 });
    });
    map.on("mouseenter", "cluster", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "cluster", () => (map.getCanvas().style.cursor = ""));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => {
      window.clearTimeout(watchdog);
      ro.disconnect();
      popup.remove();
      if (mapRef.current === map) map.remove();
      mapRef.current = null;
    };
    // initialView is intentionally read once at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("outbreaks") as GeoJSONSource | undefined)?.setData(toGeoJSON(markers));
    map.getContainer().dataset.markerCount = String(markers.length);
  }, [markers, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("selected", ["all", notCluster, ["==", ["get", "slug"], selectedSlug ?? ""]]);
  }, [selectedSlug, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const sat = mode === "satellite";
    map.setLayoutProperty("satellite", "visibility", sat ? "visible" : "none");
    map.setPaintProperty("land", "fill-opacity", sat ? 0 : 1);
    map.setPaintProperty("borders", "line-color", sat ? "#c9d2dc" : "#36414d");
    map.setPaintProperty("borders", "line-opacity", sat ? 0.55 : 1);
    try {
      localStorage.setItem(BASEMAP_PREF_KEY, mode);
    } catch { /* ignore */ }
  }, [mode, ready]);

  const focusKey = focus?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, speed: 1.4, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

  useEffect(() => {
    if (!engineError || !mapRef.current) return;
    mapRef.current.remove();
    mapRef.current = null;
  }, [engineError]);

  if (engineError) {
    return (
      <div className={cn("relative overflow-hidden bg-[#080b0f]", className)}>
        <div ref={containerRef} className="h-full w-full" data-testid="outbreak-map" data-ready="true" data-renderer="svg" data-marker-count={markers.length} role="region" aria-label="World map of outbreaks and investigations">
          <FallbackMap markers={markers} selectedSlug={selectedSlug} onSelect={onSelect} reason={engineError} view={initialView} />
        </div>
        {showLegend && <MapLegend />}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-[#080b0f]", className)}>
      <div ref={containerRef} className="h-full w-full" data-testid="outbreak-map" data-ready={ready ? "true" : "false"} data-renderer="webgl" aria-label="Interactive world map of outbreaks and investigations" role="region" />
      <div className="pointer-events-auto absolute left-2 top-2 z-10 flex overflow-hidden rounded-md border border-line-strong bg-panel/90 text-[11px] backdrop-blur" role="radiogroup" aria-label="Basemap">
        {(["map", "satellite"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("flex items-center gap-1 px-2 py-1", mode === m ? "bg-raised text-ink" : "text-ink-dim hover:text-ink")} data-testid={`basemap-${m}`}>
            {m === "map" ? <Layers className="h-3 w-3" /> : <Satellite className="h-3 w-3" />}
            {m === "map" ? "Map" : "Satellite"}
          </button>
        ))}
      </div>
      {(geoError || (mode === "satellite" && satError)) && (
        <div className="absolute left-2 top-10 z-10 max-w-xs rounded-md border border-warn/40 bg-panel/95 px-2 py-1 text-[11px] text-warn">
          {geoError ? `Basemap geometry failed to load (${geoError}). Markers remain accurate.` : "Satellite imagery could not be loaded (network or provider unavailable)."}
        </div>
      )}
      {showLegend && <MapLegend />}
    </div>
  );
}

export function MapLegend() {
  const items: { cls: Classification; shape: "ring" | "disc" | "small" }[] = [
    { cls: "UNCONFIRMED_INVESTIGATION", shape: "ring" },
    { cls: "SUSPECTED_OUTBREAK", shape: "ring" },
    { cls: "CONFIRMED_LOCALIZED", shape: "disc" },
    { cls: "CONFIRMED_WIDESPREAD", shape: "disc" },
    { cls: "RESOLVED", shape: "small" },
  ];
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-md border border-line bg-panel/90 px-2 py-1.5 text-[9.5px] backdrop-blur sm:px-2.5 sm:py-2 sm:text-[10.5px]" data-testid="map-legend">
      <ul className="space-y-1">
        {items.map(({ cls, shape }) => {
          const hex = CLASSIFICATION_HEX[cls];
          return (
            <li key={cls} className="flex items-center gap-2 text-ink-dim">
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {shape === "disc" ? <span className="h-3 w-3 rounded-full" style={{ background: hex }} /> : shape === "ring" ? <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${hex}` }}><span className="h-1 w-1 rounded-full" style={{ background: hex }} /></span> : <span className="h-2.5 w-2.5 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${hex}` }} />}
              </span>
              {CLASSIFICATION_LABEL[cls]}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 hidden max-w-[200px] border-t sm:block border-line pt-1.5 leading-snug text-ink-faint">Size reflects official confirmed cases only. Halo = country-level location. No infection zones are drawn.</p>
    </div>
  );
}
