import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

for (const path of ["/", "/map", "/outbreaks", "/outbreaks/russia-irkutsk-2026", "/intelligence", "/analytics", "/settings"]) {
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
  await page.getByRole("navigation", { name: "Primary mobile" }).getByRole("link", { name: "Outbreaks" }).click();
  await expect(page).toHaveURL(/\/outbreaks$/);
});

test("mobile overview shows the map and the investigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("outbreak-map")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(page.getByTestId("outbreak-item-russia-irkutsk-2026")).toBeVisible();
});
