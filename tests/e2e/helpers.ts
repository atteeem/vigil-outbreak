import { expect, type Page } from "@playwright/test";

/** Collects console errors / page errors; WebGL software-rendering notices are environment noise. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/WebGL|GPU stall|swiftshader/i.test(t)) return;
    // Satellite tiles / external hosts are blocked in sandboxed CI; not an application error.
    if (/arcgisonline|ERR_TUNNEL|ERR_CONNECTION|net::ERR/i.test(t)) return;
    errors.push(t);
  });
  return errors;
}

export async function waitForMap(page: Page) {
  const map = page.getByTestId("outbreak-map").first();
  await expect(map).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect.poll(async () => Number(await map.getAttribute("data-marker-count")), { timeout: 15_000 }).toBeGreaterThan(0);
  return map;
}
