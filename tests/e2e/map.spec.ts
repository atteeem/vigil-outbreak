import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { trackErrors, waitForMap } from "./helpers";

type MapHandle = {
  queryRenderedFeatures: (o?: { layers: string[] }) => { properties: Record<string, unknown> }[];
  getSource: (id: string) => { getData: () => Promise<GeoJSON.FeatureCollection> } | undefined;
  project: (ll: [number, number]) => { x: number; y: number };
  jumpTo: (o: unknown) => void;
  getFilter: (layer: string) => unknown;
  getStyle: () => { layers: { id: string }[] };
};

/** What the map is actually rendering, per layer (distinguishes "no data" from "data not drawn"). */
async function rendered(page: Page, layers: string[]) {
  return page.evaluate((ls) => {
    const m = (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap;
    return Object.fromEntries(ls.map((l) => [l, m.queryRenderedFeatures({ layers: [l] }).length]));
  }, layers);
}
async function sourceSlugs(page: Page) {
  return page.evaluate(async () => {
    const m = (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap;
    const fc = await m.getSource("outbreaks")!.getData();
    return fc.features.map((f) => String((f.properties as { slug: string }).slug));
  });
}

test("live map: engine assets load, basemap and markers render from the API data", async ({ page }) => {
  const errors = trackErrors(page);
  const assets = new Map<string, { status: number; type: string }>();
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (/maplibre-gl-(worker|shared)\.mjs$|\/geo\/|\/fonts\//.test(u.pathname)) assets.set(decodeURIComponent(u.pathname), { status: r.status(), type: r.headers()["content-type"] ?? "" });
  });
  await page.goto("/map");
  const map = await waitForMap(page);
  await expect(map).toHaveAttribute("data-renderer", "webgl");
  await expect(map.locator("canvas")).toBeVisible();
  expect((await map.boundingBox())!.height).toBeGreaterThan(400);

  // Geographic and engine assets: served, with a JavaScript MIME type for the module worker.
  for (const p of ["/maplibre-gl-worker.mjs", "/maplibre-gl-shared.mjs", "/geo/countries-50m.json"]) {
    expect(assets.get(p)?.status, p).toBe(200);
  }
  expect(assets.get("/maplibre-gl-worker.mjs")!.type).toMatch(/javascript/);
  expect([...assets.keys()].some((k) => k.startsWith("/fonts/Noto Sans") && assets.get(k)!.status === 200)).toBe(true);
  // The public worker is byte-identical to the installed maplibre-gl (a mismatched worker renders no data).
  const served = await (await page.request.get("/maplibre-gl-worker.mjs")).body();
  expect(served.equals(readFileSync(path.join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs")))).toBe(true);

  // Data: every outbreak returned by the API is in the map's GeoJSON source…
  const api = await (await page.request.get("/api/dashboard")).json();
  const apiSlugs = (api.outbreaks as { slug: string }[]).map((o) => o.slug).sort();
  expect(apiSlugs.length).toBe(6);
  expect([...new Set(await sourceSlugs(page))].sort()).toEqual(apiSlugs);
  // …and is actually drawn: basemap polygons, borders, country and city labels, markers/clusters.
  await expect.poll(async () => (await rendered(page, ["land"])).land, { timeout: 15_000 }).toBeGreaterThan(50);
  const r = await rendered(page, ["borders", "coast", "country-labels", "city-labels", "confirmed", "investigation", "cluster"]);
  expect(r.borders).toBeGreaterThan(0);
  expect(r.coast).toBeGreaterThan(0);
  expect(r["country-labels"]).toBeGreaterThan(10);
  expect(r["city-labels"]).toBeGreaterThan(5);
  expect(r.investigation).toBe(1); // Irkutsk / Shelekhov
  expect((r.confirmed ?? 0) + (r.cluster ?? 0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("live map: hover shows a popup, clicking a marker opens its details, list selection highlights it", async ({ page }) => {
  await page.goto("/map");
  await waitForMap(page);
  await expect.poll(async () => (await rendered(page, ["investigation"])).investigation, { timeout: 15_000 }).toBe(1);
  const box = (await page.getByTestId("outbreak-map").boundingBox())!;
  const pt = await page.evaluate(() => (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.project([104.2, 52.25]));
  await page.mouse.move(box.x + pt.x, box.y + pt.y);
  await expect(page.locator(".maplibregl-popup")).toContainText("Irkutsk");
  await expect(page.locator(".maplibregl-popup")).toContainText("Unconfirmed investigation");
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await expect(page.getByTestId("detail-title")).toContainText("Irkutsk", { timeout: 10_000 });
  await expect(page.getByTestId("detail-panel").getByTestId("classification-badge")).toHaveText(/Unconfirmed investigation/);

  // Selecting another outbreak from the list moves the selection ring on the map.
  await page.getByTestId("outbreak-item-yellow-fever-cote-divoire-2026").click();
  await expect(page.getByTestId("detail-title")).toContainText("Yellow fever");
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.getFilter("selected")))).toContain("yellow-fever-cote-divoire-2026");
  await expect.poll(async () => (await rendered(page, ["selected"])).selected, { timeout: 10_000 }).toBe(1);
});

test("live map: filters and the timeline change the markers drawn", async ({ page }) => {
  await page.goto("/map");
  const map = await waitForMap(page);
  await page.getByTestId("filter-status-UNCONFIRMED_INVESTIGATION").click();
  await expect(map).toHaveAttribute("data-marker-count", "1");
  await expect.poll(async () => [...new Set(await sourceSlugs(page))]).toEqual(["russia-irkutsk-2026"]);
  await expect.poll(async () => (await rendered(page, ["confirmed", "cluster"])).confirmed).toBe(0);
  await page.getByTestId("clear-filters").click();
  await expect(map).toHaveAttribute("data-marker-count", "6");

  // Playback: 30 days ago the Irkutsk investigation did not exist yet, so it is not on the map.
  await page.getByTestId("timeline-controls").getByRole("radio", { name: "30D" }).click();
  await expect(page.getByTestId("historical-banner")).toBeVisible();
  await expect.poll(async () => (await sourceSlugs(page)).includes("russia-irkutsk-2026")).toBe(false);
  await page.getByTestId("return-to-live").click();
  await expect(map).toHaveAttribute("data-marker-count", "6");
  await expect.poll(async () => (await sourceSlugs(page)).includes("russia-irkutsk-2026")).toBe(true);
});

test("without WebGL2 the map falls back to a static map that still shows and selects outbreaks", async ({ page }) => {
  // Simulates a browser with hardware acceleration off / a blocked GPU (recent Chrome no longer falls back to
  // software WebGL). This used to crash the whole page.
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  const errors = trackErrors(page);
  await page.goto("/map");
  const map = page.getByTestId("outbreak-map");
  await expect(map).toHaveAttribute("data-renderer", "svg", { timeout: 20_000 });
  await expect(page.getByTestId("map-fallback-notice")).toContainText("WebGL2");
  await expect(page.getByTestId("fallback-basemap")).toBeAttached({ timeout: 15_000 });
  await expect(page.getByTestId("outbreak-item-russia-irkutsk-2026")).toBeVisible();
  await expect(page.locator('[data-testid^="fallback-marker-"]')).toHaveCount(6);
  await page.getByTestId("fallback-marker-russia-irkutsk-2026").click();
  await expect(page.getByTestId("detail-title")).toContainText("Irkutsk");
  await page.getByTestId("filter-disease").selectOption("ebola");
  await expect(page.locator('[data-testid^="fallback-marker-"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("if the MapLibre worker cannot load, the map says so and falls back instead of staying empty", async ({ page }) => {
  await page.route("**/maplibre-gl-worker.mjs", (r) => r.fulfill({ status: 404, body: "missing" }));
  await page.goto("/map");
  const map = page.getByTestId("outbreak-map");
  await expect(map).toHaveAttribute("data-renderer", "svg", { timeout: 40_000 });
  await expect(page.getByTestId("map-fallback-notice")).toContainText("did not start");
  await expect(page.locator('[data-testid^="fallback-marker-"]')).toHaveCount(6);
});

test("outbreak page map shows the outbreak's own marker", async ({ page }) => {
  await page.goto("/outbreaks/russia-irkutsk-2026");
  await waitForMap(page);
  await expect.poll(async () => [...new Set(await sourceSlugs(page))]).toContain("russia-irkutsk-2026");
  await expect.poll(async () => (await rendered(page, ["investigation"])).investigation, { timeout: 15_000 }).toBeGreaterThan(0);
});
