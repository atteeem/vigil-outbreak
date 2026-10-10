import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

for (const path of ["/", "/map", "/timeline", "/global", "/global/map", "/outbreaks", "/outbreaks/russia-irkutsk-2026", "/intelligence", "/analytics", "/settings"]) {
  test(`no horizontal overflow on ${path}`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("mobile menu navigates", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mobile-menu-button").click();
  await page.getByRole("navigation", { name: "Primary mobile" }).getByRole("link", { name: "Timeline" }).click();
  await expect(page).toHaveURL(/\/timeline$/);
});

test("mobile global watch shows the map and the investigation", async ({ page }) => {
  await page.goto("/global");
  await expect(page.getByTestId("outbreak-map")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(page.getByTestId("outbreak-item-russia-irkutsk-2026")).toBeVisible();
});

test("mobile global map: basemap and markers render; tapping a marker opens its details", async ({ page }) => {
  await page.goto("/global/map");
  const map = page.getByTestId("outbreak-map");
  await expect(map).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  // At least the six seeded markers (Desktop tests run first and may have published more records).
  await expect.poll(async () => Number(await map.getAttribute("data-marker-count"))).toBeGreaterThanOrEqual(6);
  const box = (await map.boundingBox())!;
  expect(box.width).toBeGreaterThan(300);
  expect(box.height).toBeGreaterThan(300);
  type M = { queryRenderedFeatures: (o: { layers: string[] }) => unknown[]; project: (ll: [number, number]) => { x: number; y: number } };
  await expect.poll(() => page.evaluate(() => (window as unknown as { __outbreakMap: M }).__outbreakMap.queryRenderedFeatures({ layers: ["land"] }).length), { timeout: 15_000 }).toBeGreaterThan(50);
  const counts = await page.evaluate(() => {
    const m = (window as unknown as { __outbreakMap: M }).__outbreakMap;
    return ["investigation", "city-labels", "country-labels", "borders"].map((l) => m.queryRenderedFeatures({ layers: [l] }).length);
  });
  expect(counts.every((n) => n > 0)).toBe(true);
  const pt = await page.evaluate(() => (window as unknown as { __outbreakMap: M }).__outbreakMap.project([104.2, 52.25]));
  await page.touchscreen.tap(box.x + pt.x, box.y + pt.y);
  await expect(page.getByTestId("detail-title")).toContainText("Irkutsk", { timeout: 10_000 });
});

test("mobile investigation dashboard: status, pathogen statement, figures and spread are readable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("tracker-status")).toBeVisible();
  await expect(page.getByTestId("pathogen-statement")).toContainText("No pathogen has been laboratory-confirmed.");
  await expect(page.getByTestId("metric-DEATHS")).toHaveAttribute("data-state", "VERIFIED_OFFICIAL");
  await expect(page.getByTestId("spread-status")).toBeVisible();
  const boxes = await Promise.all(["tracker-header", "spread-status", "tracker-metrics"].map((id) => page.getByTestId(id).boundingBox()));
  for (const b of boxes) expect(b!.width).toBeLessThanOrEqual(412);
});

test("mobile investigation map: Irkutsk locations, legend and location details", async ({ page }) => {
  await page.goto("/map");
  const map = page.getByTestId("outbreak-map");
  await expect(map).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-marker-count", "3");
  expect((await map.boundingBox())!.height).toBeGreaterThan(300);
  await expect(page.getByTestId("investigation-legend")).toContainText("Precautionary measure");
  await page.getByTestId("location-list").locator('[data-role="INVESTIGATION_SITE"]').first().tap();
  await expect(page.getByTestId("location-detail")).toBeVisible();
});
