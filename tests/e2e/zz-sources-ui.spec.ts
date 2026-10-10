import { expect, test, type Page } from "@playwright/test";
import { count, row } from "./db";

// Drives the real /admin "Sources & ingestion" UI with a real password login (no test bypass header) and checks
// the database after every action. Runs after zz-admin.spec (which disables the real WHO source).
test.use({ extraHTTPHeaders: {} });

const FIXTURE = "http://localhost:3100/api/test-fixtures";
type Src = { id: string; url: string | null; enabled: number; endpointStatus: string; lastVerifiedAt: string | null; lastSuccessAt: string | null; lastFetchAt: string | null; lastError: string | null; lastErrorKind: string | null };
const source = (slug: string) => row<Src>("SELECT * FROM Source WHERE slug = ?", slug)!;

async function login(page: Page) {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sources & ingestion" })).toBeVisible();
}

test("sources UI: save URL, test, enable, fetch now, fetch all, disable — each persisted", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const rowEl = page.getByTestId("source-ecdc-cdtr");
  const flash = (kind: "admin-message" | "admin-error") => rowEl.getByTestId(kind);

  // No URL yet: Test / Fetch are disabled and the row says why.
  expect(source("ecdc-cdtr").url).toBeNull();
  await expect(rowEl.getByTestId("source-no-url")).toBeVisible();
  await expect(rowEl.getByTestId("test-ecdc-cdtr")).toBeDisabled();
  await expect(rowEl.getByTestId("fetch-ecdc-cdtr")).toBeDisabled();

  // Save URL.
  await rowEl.getByRole("textbox", { name: /URL/ }).fill(`${FIXTURE}/ecdc-drupal.xml`);
  await rowEl.getByRole("button", { name: "Save" }).click();
  await expect(flash("admin-message")).toHaveText("Saved.");
  expect(source("ecdc-cdtr")).toMatchObject({ url: `${FIXTURE}/ecdc-drupal.xml`, endpointStatus: "UNTESTED", enabled: 0 });
  await expect(rowEl.getByTestId("source-no-url")).toHaveCount(0);

  // Enabling before a passing test is refused, and the refusal is shown.
  await rowEl.getByTestId("toggle-ecdc-cdtr").click();
  await expect(flash("admin-error")).toContainText("Test endpoint");
  expect(source("ecdc-cdtr").enabled).toBe(0);

  // Test endpoint: parses, stores nothing, records the verdict.
  const articlesBefore = count("SELECT COUNT(*) FROM SourceArticle WHERE sourceId = ?", source("ecdc-cdtr").id);
  await rowEl.getByTestId("test-ecdc-cdtr").click();
  await expect(flash("admin-message")).toContainText("Endpoint OK — 2 items parsed");
  expect(source("ecdc-cdtr").endpointStatus).toBe("WORKING");
  expect(source("ecdc-cdtr").lastVerifiedAt).not.toBeNull();
  expect(count("SELECT COUNT(*) FROM SourceArticle WHERE sourceId = ?", source("ecdc-cdtr").id)).toBe(articlesBefore);
  await expect(rowEl.getByTestId("source-last-verification")).toContainText("OK: HTTP 200");

  // Enable.
  await rowEl.getByTestId("toggle-ecdc-cdtr").click();
  await expect(flash("admin-message")).toContainText("Enabled");
  expect(source("ecdc-cdtr").enabled).toBe(1);
  await expect(rowEl.getByTestId("toggle-ecdc-cdtr")).toHaveText("Disable");

  // Fetch now: articles stored as unreviewed, unverified feed entries; timestamps and run log updated.
  const started = Date.now();
  await rowEl.getByTestId("fetch-ecdc-cdtr").click();
  await expect(flash("admin-message")).toContainText("2 new", { timeout: 30_000 });
  const src = source("ecdc-cdtr");
  expect(Date.parse(src.lastSuccessAt!)).toBeGreaterThanOrEqual(started - 1000);
  expect(Date.parse(src.lastFetchAt!)).toBeGreaterThanOrEqual(started - 1000);
  expect(count("SELECT COUNT(*) FROM SourceArticle WHERE sourceId = ? AND origin = 'INGESTED' AND reviewStatus = 'PENDING' AND verificationStatus = 'UNVERIFIED'", src.id)).toBe(2);
  expect(row<{ status: string; itemsNew: number; trigger: string }>("SELECT status, itemsNew, trigger FROM IngestionRun WHERE sourceId = ? ORDER BY startedAt DESC", src.id)).toMatchObject({ itemsNew: 2, trigger: "MANUAL" });
  await expect(rowEl).toContainText("2 articles");
  await expect(rowEl).not.toContainText("last success never");

  // Fetch all: polls every enabled source; this one now only finds duplicates.
  const runsBefore = count("SELECT COUNT(*) FROM IngestionRun WHERE sourceId = ?", src.id);
  await page.getByTestId("fetch-all").click();
  await expect(page.getByTestId("fetch-results")).toContainText("ECDC Communicable Disease Threats Report (RSS): SUCCESS · 2 fetched · 0 new · 2 duplicate", { timeout: 60_000 });
  expect(count("SELECT COUNT(*) FROM IngestionRun WHERE sourceId = ?", src.id)).toBe(runsBefore + 1);
  expect(count("SELECT COUNT(*) FROM SourceArticle WHERE sourceId = ?", src.id)).toBe(2);

  // Ingested entries appear in the public intelligence feed, labelled as auto-ingested and awaiting review.
  const title = row<{ title: string }>("SELECT title FROM SourceArticle WHERE sourceId = ? ORDER BY publishedAt DESC", src.id)!.title;
  await page.goto("/intelligence?scope=all&types=all");
  const item = page.getByTestId("feed-item").filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item.getByTestId("origin-badge")).toHaveText("Auto-ingested");

  // A localhost fixture is not a live source: the indicator must not claim Live.
  await expect(page.getByTestId("live-indicator")).not.toHaveAttribute("data-state", "live");

  // Disable.
  await page.goto("/admin");
  await rowEl.getByTestId("toggle-ecdc-cdtr").click();
  await expect(flash("admin-message")).toContainText("Disabled");
  expect(source("ecdc-cdtr").enabled).toBe(0);
});

test("sources UI: endpoint and fetch failures are shown as errors and recorded", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const rowEl = page.getByTestId("source-cdc-han");
  await rowEl.getByRole("textbox", { name: /URL/ }).fill(`${FIXTURE}/error-500`);
  await rowEl.getByRole("button", { name: "Save" }).click();
  await expect(rowEl.getByTestId("admin-message")).toHaveText("Saved.");

  await rowEl.getByTestId("test-cdc-han").click();
  await expect(rowEl.getByTestId("admin-error")).toContainText("Endpoint check failed", { timeout: 60_000 }); // 5xx is retried with backoff
  expect(source("cdc-han").endpointStatus).toBe("FAILING");

  await rowEl.getByTestId("fetch-cdc-han").click();
  await expect(rowEl.getByTestId("admin-error")).toContainText("FAILED", { timeout: 60_000 });
  const s = source("cdc-han");
  expect(s.lastErrorKind).toBe("HTTP_SERVER");
  expect(s.lastSuccessAt).toBeNull();
  await page.reload();
  await expect(rowEl.getByTestId("source-last-error")).toContainText("Publisher server error");
  // Enabling a failing endpoint is still refused.
  await rowEl.getByTestId("toggle-cdc-han").click();
  await expect(rowEl.getByTestId("admin-error")).toContainText("Test endpoint");
  expect(source("cdc-han").enabled).toBe(0);
});
