import { expect, test, type Page } from "@playwright/test";
import { trackErrors, waitForMap } from "./helpers";

// The focused tracker as a visitor sees it (read-only; runs before the zz-* specs that change data).

type MapHandle = {
  getSource: (id: string) => { getData: () => Promise<GeoJSON.FeatureCollection> };
  queryRenderedFeatures: (o: { layers: string[] }) => unknown[];
  getZoom: () => number;
  getCenter: () => { lng: number; lat: number };
  getLayoutProperty: (layer: string, prop: string) => unknown;
  project: (ll: [number, number]) => { x: number; y: number };
};
const features = (page: Page) =>
  page.evaluate(async () => (await (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.getSource("outbreaks").getData()).features.map((f) => f.properties as Record<string, unknown>));
const rendered = (page: Page, layer: string) => page.evaluate((l) => (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.queryRenderedFeatures({ layers: [l] }).length, layer);

test("investigation dashboard: status, pathogen accuracy, sourced figures with explicit states, spread", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("tracker-title")).toContainText("Irkutsk anti-plague institute worker");
  await expect(page.getByTestId("tracker-status").getByTestId("classification-badge")).toHaveText(/Unconfirmed investigation/);
  const pathogen = page.getByTestId("pathogen-statement");
  await expect(pathogen).toContainText("No pathogen has been laboratory-confirmed.");
  await expect(pathogen).toContainText("Plague (Yersinia pestis, a bacterium, not a virus) is under consideration but not confirmed.");
  await expect(page.locator("body")).not.toContainText(/confirmed plague outbreak/i);

  await expect(page.getByTestId("last-verified-update")).toContainText("Contact testing");
  await expect(page.getByTestId("last-verified-update")).toContainText("reported 2026-10-06");

  const conf = page.getByTestId("metric-CONFIRMED_CASES");
  await expect(conf).toHaveAttribute("data-state", "UNKNOWN");
  await expect(conf.getByTestId("metric-value")).toHaveText("Not reported");
  await expect(conf).toContainText("No authority has reported a laboratory-confirmed case.");
  const deaths = page.getByTestId("metric-DEATHS");
  await expect(deaths).toHaveAttribute("data-state", "VERIFIED_OFFICIAL");
  await expect(deaths.getByTestId("metric-value")).toHaveText("1");
  await expect(deaths.getByTestId("death-cause")).toHaveText("Cause of death not laboratory-confirmed.");
  await expect(deaths.getByTestId("metric-source")).toContainText("reported 2026-10-05 18:00 UTC");
  await expect(deaths.getByTestId("metric-source").getByRole("link")).toHaveAttribute("href", /newsweek\.com/);
  const contacts = page.getByTestId("metric-UNDER_OBSERVATION");
  await expect(contacts).toHaveAttribute("data-state", "UNVERIFIED");
  await expect(contacts.getByTestId("metric-value")).toContainText("189–197");
  await expect(contacts.getByTestId("metric-state")).toHaveText("Unverified report");
  await expect(contacts).toContainText("not an official count");

  const spread = page.getByTestId("spread-status");
  await expect(spread).toHaveAttribute("data-state", "NO_EVIDENCE");
  await expect(spread).toContainText("No verified evidence of spread beyond Irkutsk Oblast.");
  await expect(spread).toContainText("Quarantined or observed contacts are precautionary measures, not infections");

  // Evidence kept apart: claims about the pathogen, laboratory findings, alternative accounts.
  await expect(page.getByTestId("hypotheses")).toContainText("The worker died from plague.");
  await expect(page.getByTestId("hypotheses").getByTestId("finding").filter({ hasText: "The worker died from plague." })).toContainText("Disputed");
  await expect(page.getByTestId("lab-findings")).toContainText("rhinovirus");
  await expect(page.getByTestId("lab-findings")).not.toContainText("test tube");
  await expect(page.getByTestId("alternatives")).toContainText("Thailand");
  await expect(page.getByTestId("contradictions")).toContainText("Rospotrebnadzor");

  await expect(page.getByTestId("developments").getByTestId("development").first()).toBeVisible();
  await expect(page.getByTestId("developments").getByTestId("event-dates").first()).toContainText("Reported:");
  await expect(page.getByTestId("last-24h")).toBeVisible();

  const intel = page.getByTestId("targeted-intel");
  await expect(intel.getByTestId("intel-item").first()).toBeVisible();
  await expect(intel).not.toContainText("Ebola");
  await expect(intel.getByTestId("topic-chip").first()).toBeVisible();
  await expect(intel.getByRole("link", { name: "Intelligence → Other news" })).toHaveAttribute("href", "/intelligence?scope=other");

  // Mini map: only the investigation's verified locations.
  const map = await waitForMap(page);
  await expect(map).toHaveAttribute("data-marker-count", "3");
  expect(errors).toEqual([]);
});

test("investigation dashboard as known on 3 October hides later facts", async ({ page }) => {
  await page.goto("/?asOf=2026-10-03T00:00:00.000Z");
  await expect(page.getByTestId("historical-banner")).toBeVisible();
  await expect(page.getByTestId("metric-DEATHS")).toHaveAttribute("data-state", "UNKNOWN");
  await expect(page.getByTestId("metric-UNDER_OBSERVATION").getByTestId("metric-value")).toContainText("200");
  await expect(page.getByTestId("contradictions")).not.toContainText("Rospotrebnadzor states");
  await page.getByTestId("as-of-live").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("historical-banner")).toHaveCount(0);
  await expect(page.getByTestId("metric-DEATHS")).toHaveAttribute("data-state", "VERIFIED_OFFICIAL");
});

test("live map starts on Irkutsk/Shelekhov with role symbols; unrelated outbreaks only on request", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/map");
  const map = await waitForMap(page);
  await expect(map).toHaveAttribute("data-renderer", "webgl");
  await expect(map).toHaveAttribute("data-marker-count", "3");
  const view = await page.evaluate(() => { const m = (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap; return { zoom: m.getZoom(), ...m.getCenter() }; });
  expect(view.zoom).toBeGreaterThan(7);
  expect(view.lng).toBeGreaterThan(103);
  expect(view.lng).toBeLessThan(105.5);
  const props = await features(page);
  expect(new Set(props.map((p) => p.slug))).toEqual(new Set(["russia-irkutsk-2026"]));
  expect(props.map((p) => p.kind).sort()).toEqual(["investigation", "investigation", "precaution"]);
  await expect.poll(() => rendered(page, "investigation"), { timeout: 15_000 }).toBe(2);
  await expect.poll(() => rendered(page, "precaution")).toBe(1);
  await expect(page.getByTestId("investigation-legend")).toContainText("Precautionary measure — not an infection");
  await expect(page.getByTestId("spread-status")).toHaveAttribute("data-state", "NO_EVIDENCE");

  // Location list → details. A precautionary measure says plainly it is not an infection.
  const precaution = page.getByTestId("location-list").locator('[data-role="PRECAUTIONARY_MEASURE"]');
  await precaution.click();
  await expect(page.getByTestId("location-detail")).toContainText("does not mean anyone here is infected");

  // Click the Shelekhov marker on the map.
  await page.getByTestId("focus-origin").click();
  await page.waitForTimeout(1500);
  const box = (await map.boundingBox())!;
  const pt = await page.evaluate(() => (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.project([104.0975, 52.2104]));
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await expect(page.getByTestId("location-detail-name")).toHaveText("Shelekhov");

  // Satellite mode is preserved.
  await page.getByTestId("basemap-satellite").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.getLayoutProperty("satellite", "visibility"))).toBe("visible");
  await page.getByTestId("basemap-map").click();

  // Unrelated outbreaks: off by default, faded when switched on.
  await page.getByTestId("toggle-other-outbreaks").check();
  await expect.poll(async () => Number(await map.getAttribute("data-marker-count"))).toBeGreaterThan(3);
  const withOthers = await features(page);
  expect(withOthers.filter((p) => p.slug !== "russia-irkutsk-2026").every((p) => p.muted === true)).toBe(true);
  await page.getByTestId("toggle-other-outbreaks").uncheck();
  await expect(map).toHaveAttribute("data-marker-count", "3");
  expect(errors).toEqual([]);
});

test("live map playback: the precautionary location appears only once it was reported", async ({ page }) => {
  await page.goto("/map?asOf=2026-10-03T00:00:00.000Z");
  const map = await waitForMap(page);
  await expect(page.getByTestId("historical-banner")).toBeVisible();
  await expect(map).toHaveAttribute("data-marker-count", "2");
  await page.getByTestId("return-to-live").click();
  await expect(map).toHaveAttribute("data-marker-count", "3");
});

test("timeline: occurred vs reported, categories, and what was known at a point in time", async ({ page }) => {
  await page.goto("/timeline");
  const entries = page.getByTestId("timeline-entry");
  await expect.poll(() => entries.count()).toBeGreaterThan(10);
  const hosp = entries.filter({ hasText: "Patient hospitalised" });
  await expect(hosp.getByTestId("occurred-at")).toHaveText("Occurred: 2026-09-29");
  await expect(hosp.getByTestId("reported-at")).toHaveText("Reported: 2026-10-02 12:00 UTC");
  await expect(entries.filter({ hasText: "Regional statements referencing plague" })).toHaveAttribute("data-category", "CORRECTION");
  await expect(entries.filter({ hasText: "Investigation opened" })).toHaveAttribute("data-category", "STATUS");

  await page.getByTestId("timeline-filter-TESTING").click();
  const cats = await entries.evaluateAll((els) => els.map((e) => e.getAttribute("data-category")));
  expect(cats.length).toBeGreaterThan(0);
  expect(new Set(cats)).toEqual(new Set(["TESTING"]));
  await page.getByTestId("timeline-filter-TESTING").click();

  const total = await entries.count();
  await hosp.getByTestId("known-at-link").click();
  await expect(page.getByTestId("historical-banner")).toBeVisible();
  await expect.poll(() => entries.count()).toBeLessThan(total);
  await expect(page.getByTestId("timeline-list")).not.toContainText("ECDC: no secondary cases");
});

test("intelligence: targeted reports first, unrelated news in a secondary section", async ({ page }) => {
  await page.goto("/intelligence");
  await expect(page.getByTestId("intel-tab-tracked")).toHaveAttribute("aria-current", "page");
  const list = page.getByTestId("feed-list");
  await expect(list).toContainText("Russia says no plague found in contacts");
  await expect(list).not.toContainText("Ebola");
  await page.getByTestId("intel-topic-LAB_RESULTS").click();
  await expect(list.getByTestId("feed-item").first()).toBeVisible();
  await page.getByTestId("intel-tab-other").click();
  await expect(page).toHaveURL(/scope=other/);
  await expect(page.getByTestId("feed-list")).toContainText("Ebola");
  await expect(page.getByTestId("feed-list")).not.toContainText("Russia says no plague found in contacts");
});
