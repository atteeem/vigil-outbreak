import { expect, test } from "@playwright/test";
import { trackErrors, waitForMap } from "./helpers";

test("overview loads with KPIs, map, list and no console errors", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "VIGIL OUTBREAK home" })).toBeVisible();
  for (const l of ["Overview", "Live Map", "Outbreaks", "Intelligence", "Analytics"]) await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: l })).toBeVisible();
  await expect(page.getByTestId("kpi-investigations")).toContainText("1");
  await expect(page.getByTestId("kpi-refresh")).toContainText("Last successful live ingestion");
  await expect(page.getByTestId("kpi-refresh")).toContainText("None yet");
  // No live source has succeeded in the test environment: the UI must not claim to be live.
  await expect(page.getByTestId("live-indicator")).not.toHaveAttribute("data-state", "live");
  await expect(page.getByTestId("live-indicator")).toContainText("Not live");
  await expect(page.getByTestId("data-status-banner")).toContainText("Not live");
  await expect(page.getByTestId("data-origins")).toContainText("seeded");
  const map = await waitForMap(page);
  const box = await map.boundingBox();
  expect(box!.height).toBeGreaterThan(300);
  const canvas = map.locator("canvas");
  await expect(canvas).toBeVisible();
  // Rendered features exist (basemap land + markers)
  const rendered = await page.evaluate(() => (window as unknown as { __outbreakMap: { queryRenderedFeatures: () => unknown[] } }).__outbreakMap.queryRenderedFeatures().length);
  expect(rendered).toBeGreaterThan(50);
  await expect(page.getByTestId("outbreak-item-russia-irkutsk-2026")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test("Russia investigation: list click opens details, map marker is an investigation, full page is sourced", async ({ page }) => {
  await page.goto("/map");
  await waitForMap(page);
  await page.getByTestId("outbreak-item-russia-irkutsk-2026").click();
  const panel = page.getByTestId("detail-panel");
  await expect(panel.getByTestId("detail-title")).toContainText("Irkutsk");
  await expect(panel.getByTestId("classification-badge")).toHaveText(/Unconfirmed investigation/);
  await expect(panel).toContainText("Under consideration (not confirmed): Plague");
  await expect(panel.getByTestId("stat-confirmed")).toContainText("Not reported");
  await expect(panel.getByTestId("stat-deaths")).toContainText("cause not confirmed");
  // Russia's marker is rendered as an investigation ring at Irkutsk/Shelekhov, not a filled/confirmed layer.
  const kinds = await page.evaluate(() => {
    const m = (window as unknown as { __outbreakMap: { querySourceFeatures: (s: string) => { properties: Record<string, unknown> }[] } }).__outbreakMap;
    return m.querySourceFeatures("outbreaks").filter((f) => f.properties.slug === "russia-irkutsk-2026").map((f) => [f.properties.classification, f.properties.locationName]);
  });
  expect(kinds.length).toBeGreaterThan(0);
  expect(kinds[0]![0]).toBe("UNCONFIRMED_INVESTIGATION");
  expect(String(kinds[0]![1])).toContain("Shelekhov");

  await panel.getByTestId("open-outbreak-page").click();
  await expect(page).toHaveURL(/\/outbreaks\/russia-irkutsk-2026/);
  await expect(page.getByTestId("outbreak-title")).toContainText("undetermined cause");
  await expect(page.getByTestId("death-attribution-notice")).toContainText("A confirmed death is not a confirmed plague death");
  await expect(page.getByTestId("section-contradictions")).toContainText("Rospotrebnadzor");
  await expect(page.getByTestId("section-risk")).toContainText("ECDC");
  await expect(page.getByTestId("section-sources")).toContainText("ECDC closely monitoring");
  await expect(page.getByTestId("unverified-figures")).toContainText("189–197");
  await expect(page.getByTestId("stat-confirmed")).toContainText("Not reported");
  await expect(page.getByTestId("outbreak-series-empty")).toBeVisible();
  // Seeded facts are labelled and listed for primary-source validation; the record stays unconfirmed.
  await expect(page.getByTestId("section-sources").getByTestId("origin-badge").first()).toHaveText("Seeded");
  await expect(page.getByTestId("section-validation")).toContainText("compiled by hand");
  await expect(page.getByTestId("section-validation")).toContainText("Newsweek");
  await expect(page.getByTestId("section-chronology")).toContainText("WHO awaiting confirmation");
});

test("clicking the map marker selects the investigation", async ({ page }) => {
  await page.goto("/map");
  const map = await waitForMap(page);
  await page.evaluate(() => (window as unknown as { __outbreakMap: { jumpTo: (o: unknown) => void } }).__outbreakMap.jumpTo({ center: [104.2, 52.25], zoom: 6 }));
  await page.waitForTimeout(1200);
  const pt = await page.evaluate(() => {
    const m = (window as unknown as { __outbreakMap: { project: (ll: [number, number]) => { x: number; y: number } } }).__outbreakMap;
    return m.project([104.0975, 52.2104]);
  });
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await expect(page.getByTestId("detail-title")).toContainText("Irkutsk", { timeout: 10_000 });
});

test("filters change the displayed results", async ({ page }) => {
  await page.goto("/map");
  await waitForMap(page);
  const count = page.getByTestId("list-count");
  await expect(count).toHaveText("6/6");
  await page.getByTestId("filter-disease").selectOption("ebola");
  await expect(count).toHaveText("2/6");
  await expect(page.getByTestId("outbreak-item-russia-irkutsk-2026")).toHaveCount(0);
  await expect.poll(async () => Number(await page.getByTestId("outbreak-map").getAttribute("data-marker-count"))).toBe(2);
  await page.getByTestId("filter-disease").selectOption("");
  await page.getByTestId("filter-status-UNCONFIRMED_INVESTIGATION").click();
  await expect(count).toHaveText("1/6");
  await expect(page.getByTestId("outbreak-item-russia-irkutsk-2026")).toBeVisible();
  await page.getByTestId("clear-filters").click();
  await page.getByTestId("filter-country").selectOption("CD");
  await expect(count).toHaveText("2/6");
  expect(page.url()).toContain("country=CD");
});

test("timeline: presets, scrubbing, stepping, play/pause and return to live", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const tl = page.getByTestId("timeline-controls");
  await tl.getByRole("radio", { name: "30D" }).click();
  await expect(page.getByTestId("historical-banner")).toBeVisible();
  await expect(page.getByTestId("timeline-asof")).toContainText("Viewing");
  // At the start of a 30-day window (~8 Sep) the Irkutsk investigation had not been reported.
  await expect(page.getByTestId("outbreak-item-russia-irkutsk-2026")).toHaveCount(0);
  const before = await page.getByTestId("timeline-asof").textContent();
  await tl.getByRole("button", { name: "Step forward" }).click();
  await expect(page.getByTestId("timeline-asof")).not.toHaveText(before!);
  await page.getByTestId("timeline-scrubber").fill("1000");
  await expect(page.getByTestId("outbreak-item-russia-irkutsk-2026")).toBeVisible();
  await page.getByTestId("timeline-scrubber").fill("500");
  const mid = await page.getByTestId("timeline-asof").textContent();
  await tl.getByRole("radio", { name: "4×" }).click();
  await tl.getByRole("button", { name: "Play" }).click();
  await expect(tl.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.waitForTimeout(700);
  await tl.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("timeline-asof")).not.toHaveText(mid!);
  await page.getByTestId("return-to-live").click();
  await expect(page.getByTestId("historical-banner")).toHaveCount(0);
  await expect(page.getByTestId("timeline-asof")).toHaveText("Live");
});

test("historical outbreak page hides later facts", async ({ page }) => {
  await page.goto("/outbreaks/russia-irkutsk-2026?asOf=2026-10-03T00:00:00.000Z");
  await expect(page.getByTestId("historical-banner")).toBeVisible();
  await expect(page.getByTestId("section-chronology")).not.toContainText("ECDC: no secondary cases");
  await expect(page.getByTestId("section-risk")).toContainText("No assessments published");
  await page.goto("/outbreaks/russia-irkutsk-2026");
  await expect(page.getByTestId("section-chronology")).toContainText("ECDC: no secondary cases");
});

test("outbreaks, intelligence, analytics and settings pages work", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/outbreaks?disease=ebola");
  await expect(page.getByTestId("outbreaks-count")).toContainText("2 of 6");
  await page.goto("/outbreaks?q=irkutsk");
  await expect(page.getByTestId("outbreak-card-russia-irkutsk-2026")).toBeVisible();
  await page.goto("/intelligence?sourceType=OFFICIAL");
  await expect(page.getByTestId("feed-item").first()).toBeVisible();
  await expect(page.getByTestId("feed-list")).not.toContainText("The Moscow Times");
  await page.goto("/analytics");
  await expect(page.getByTestId("series-confirmed")).toBeVisible(); // DRC Ebola: two verified WHO figures
  await expect(page.getByTestId("series-suspected-empty")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByTestId("source-status")).toContainText("WHO Disease Outbreak News");
  expect(errors).toEqual([]);
});

test("search finds the investigation", async ({ page }) => {
  await page.goto("/outbreaks");
  await page.getByTestId("search-button").click();
  await page.getByTestId("search-input").fill("Shelekhov");
  await page.getByRole("button", { name: /Irkutsk/ }).first().click();
  await expect(page).toHaveURL(/russia-irkutsk-2026/);
});
