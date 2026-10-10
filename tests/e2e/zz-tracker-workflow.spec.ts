import { expect, test } from "@playwright/test";
import { count, row } from "./db";
import { waitForMap } from "./helpers";

// End to end through the real UI and database, for the tracked investigation:
//   official reports arrive → tagged as about the Irkutsk investigation, material changes queued first → nothing
//   is published automatically → an analyst adds one to the timeline (unverified) → a new development appears in
//   "last 24 hours" → a reported case in another country stays off the map until verified with evidence.

const FEED = "http://localhost:3100/api/test-fixtures/irkutsk-feed.xml";
const LAB_TITLE = "Fixture: Laboratory tests of Irkutsk contacts negative for plague";
const KZ_TITLE = "Fixture: Kazakhstan investigates suspected case in traveller from Irkutsk";

test("tracked ingestion → priority review → timeline → spread only with evidence", async ({ page }) => {
  test.setTimeout(240_000);
  const ru = row<{ id: string }>("SELECT id FROM Outbreak WHERE slug = 'russia-irkutsk-2026'")!;
  const before = {
    updates: count("SELECT COUNT(*) FROM OutbreakUpdate WHERE outbreakId = ?", ru.id),
    locations: count("SELECT COUNT(*) FROM OutbreakLocation WHERE outbreakId = ?", ru.id),
    observations: count("SELECT COUNT(*) FROM OutbreakObservation WHERE outbreakId = ?", ru.id),
  };

  // 1. The official Russian health-authority source: save its URL, test, enable, fetch.
  await page.goto("/admin");
  const src = page.getByTestId("source-rospotrebnadzor-news");
  await src.getByRole("textbox", { name: /URL/ }).fill(FEED);
  await src.getByRole("button", { name: "Save" }).click();
  await expect(src.getByTestId("admin-message")).toHaveText("Saved.");
  await src.getByTestId("test-rospotrebnadzor-news").click();
  await expect(src.getByTestId("admin-message")).toContainText("Endpoint OK");
  await src.getByTestId("toggle-rospotrebnadzor-news").click();
  await expect(src.getByTestId("admin-message")).toContainText("Enabled");
  await src.getByTestId("fetch-rospotrebnadzor-news").click();
  await expect(src.getByTestId("admin-message")).toContainText("7 new", { timeout: 30_000 });

  // Nothing about the investigation changed automatically: no timeline entries, figures or locations.
  expect(count("SELECT COUNT(*) FROM OutbreakUpdate WHERE outbreakId = ?", ru.id)).toBe(before.updates);
  expect(count("SELECT COUNT(*) FROM OutbreakLocation WHERE outbreakId = ?", ru.id)).toBe(before.locations);
  expect(count("SELECT COUNT(*) FROM OutbreakObservation WHERE outbreakId = ?", ru.id)).toBe(before.observations);
  expect(row("SELECT trackedLevel, materialChange, reviewStatus, outbreakId FROM SourceArticle WHERE title = ?", KZ_TITLE)).toMatchObject({ trackedLevel: "DIRECT", materialChange: 1, reviewStatus: "PENDING", outbreakId: null });

  // The admin home summarises what is waiting.
  await page.reload();
  await expect(page.getByTestId("tracked-review-summary")).toContainText("possible material change");

  // 2. Public dashboard: the official report is visible as targeted intelligence (awaiting review); figures and
  //    spread are unchanged; unrelated plague news is not on the dashboard.
  await page.goto("/");
  const intel = page.getByTestId("targeted-intel");
  await expect(intel).toContainText(LAB_TITLE);
  await expect(intel.getByTestId("intel-item").filter({ hasText: LAB_TITLE })).toContainText("awaiting review");
  await expect(intel).not.toContainText("Madagascar");
  await expect(page.getByTestId("pending-review")).toContainText("possible material change");
  // (zz-admin may have promoted an unverified claim as a confirmed-case figure: it must still not be a headline.)
  await expect(page.getByTestId("metric-CONFIRMED_CASES")).not.toHaveAttribute("data-state", "VERIFIED_OFFICIAL");
  await expect(page.getByTestId("spread-status")).toHaveAttribute("data-state", "NO_EVIDENCE");

  // 3. Review queue (investigation scope): material changes first; the Kazakhstan report is flagged as Spread.
  await page.goto("/admin/review?scope=tracked");
  const cards = page.getByTestId("review-article");
  await expect(cards.first()).toHaveAttribute("data-material", "true");
  const kz = cards.filter({ hasText: KZ_TITLE });
  await expect(kz.getByTestId("material-badge")).toBeVisible();
  await expect(kz.getByTestId("tracked-info")).toContainText("Spread");
  await expect(kz.getByTestId("tracked-info")).toContainText("needs evidence");
  await expect(cards.filter({ hasText: "Madagascar" })).toHaveCount(0);

  // 4. Add the laboratory report to the investigation timeline (stays unverified) and accept it.
  const lab = cards.filter({ hasText: LAB_TITLE });
  await lab.getByTestId("add-to-timeline").click();
  const form = lab.getByTestId("timeline-form");
  await form.getByLabel("Timeline category").selectOption("TESTING");
  await form.getByLabel("Occurred at").fill("2026-10-07T00:00");
  await form.getByTestId("timeline-submit").click();
  await expect(page.getByTestId("review-article").filter({ hasText: LAB_TITLE })).toHaveCount(0, { timeout: 15_000 }); // left the pending queue
  const art = row<{ id: string; reviewStatus: string; outbreakId: string; verificationStatus: string }>("SELECT id, reviewStatus, outbreakId, verificationStatus FROM SourceArticle WHERE title = ?", LAB_TITLE)!;
  expect(art).toMatchObject({ reviewStatus: "ACCEPTED", outbreakId: ru.id, verificationStatus: "UNVERIFIED" });
  expect(row("SELECT verificationStatus, category, sourceType, occurredAt FROM OutbreakUpdate WHERE sourceArticleId = ?", art.id)).toMatchObject({ verificationStatus: "UNVERIFIED", category: "TESTING", sourceType: "OFFICIAL" });

  await page.goto("/timeline");
  const entry = page.getByTestId("timeline-entry").filter({ hasText: LAB_TITLE });
  await expect(entry).toHaveAttribute("data-category", "TESTING");
  await expect(entry).toHaveAttribute("data-verification", "UNVERIFIED");
  await expect(entry.getByTestId("occurred-at")).toHaveText("Occurred: 2026-10-07");
  await expect(entry.getByTestId("reported-at")).toHaveText("Reported: 2026-10-08 09:00 UTC");

  // 5. A development published now shows under "What changed in the last 24 hours".
  await page.goto(`/admin/outbreaks/${ru.id}`);
  const updForm = page.locator("form").filter({ has: page.getByLabel("Update title") });
  await updForm.getByLabel("Kind").selectOption("OFFICIAL_STATEMENT");
  await updForm.getByLabel("Attributed to").fill("E2E regional health authority");
  await updForm.getByLabel("Update title").fill("E2E: regional authority says observation period continues");
  await updForm.getByLabel("Update body").fill("The observation period for contacts continues; no new cases reported.");
  await updForm.getByRole("button", { name: /Add update/ }).click();
  await expect(page.getByTestId("admin-message").first()).toContainText("Update added");
  await page.goto("/");
  await expect(page.getByTestId("last-24h")).toContainText("E2E: regional authority says observation period continues");

  // 6. Spread needs evidence. An unverified case location in Kazakhstan is listed but neither mapped nor counted.
  await page.goto(`/admin/outbreaks/${ru.id}`);
  const add = page.getByTestId("add-location-form");
  await add.getByLabel("Location name").fill("Almaty (traveller from Irkutsk)");
  await add.getByLabel("Location country").selectOption("KZ");
  await add.getByLabel("Location role").selectOption("SUSPECTED_CASE");
  await add.getByLabel("Location latitude").fill("43.24");
  await add.getByLabel("Location longitude").fill("76.95");
  await add.getByTestId("add-location").click();
  await expect(add.getByTestId("admin-message")).toContainText("Location added");
  const kzLoc = () => row<{ id: string; verificationStatus: string }>("SELECT id, verificationStatus FROM OutbreakLocation WHERE outbreakId = ? AND countryCode = 'KZ'", ru.id)!;
  expect(kzLoc().verificationStatus).toBe("UNVERIFIED");

  await page.goto("/map");
  const map = await waitForMap(page);
  await expect(map).toHaveAttribute("data-marker-count", "3");
  await expect(page.getByTestId("unmapped-locations")).toContainText("Almaty (traveller from Irkutsk)");
  await expect(page.getByTestId("spread-status")).toHaveAttribute("data-state", "NO_EVIDENCE");
  await expect(page.getByTestId("spread-unverified")).toContainText("awaiting verification");

  // Verifying without evidence is refused; with evidence it is accepted.
  await page.goto(`/admin/outbreaks/${ru.id}`);
  const locRow = page.getByTestId("admin-location").filter({ hasText: "Almaty" });
  await locRow.getByLabel(/Verification of/).selectOption("VERIFIED");
  await expect(locRow.getByTestId("admin-error")).toContainText("only be verified with evidence");
  expect(kzLoc().verificationStatus).toBe("UNVERIFIED");
  await locRow.getByLabel(/Evidence for/).fill("E2E: Kazakhstan Ministry of Health statement (fixture)");
  await locRow.getByLabel(/Verification of/).selectOption("VERIFIED");
  await expect(page.getByTestId("admin-location").filter({ hasText: "Almaty" })).toContainText("Verified", { timeout: 10_000 });
  expect(kzLoc().verificationStatus).toBe("VERIFIED");

  await page.goto("/");
  await expect(page.getByTestId("spread-status")).toHaveAttribute("data-state", "SPREAD_VERIFIED");
  await expect(page.getByTestId("spread-status")).toContainText("Almaty");
  await page.goto("/map");
  const map2 = await waitForMap(page);
  await expect(map2).toHaveAttribute("data-marker-count", "4");
  const kinds = await page.evaluate(async () => (await (window as unknown as { __outbreakMap: { getSource: (id: string) => { getData: () => Promise<GeoJSON.FeatureCollection> } } }).__outbreakMap.getSource("outbreaks").getData()).features.map((f) => (f.properties as { kind: string }).kind));
  expect(kinds.filter((k) => k === "suspected")).toHaveLength(1);

  // Clean up so later (mobile) runs see the seeded state; removal is an audited analyst action.
  await page.goto(`/admin/outbreaks/${ru.id}`);
  await page.getByTestId("admin-location").filter({ hasText: "Almaty" }).getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => count("SELECT COUNT(*) FROM OutbreakLocation WHERE outbreakId = ? AND countryCode = 'KZ'", ru.id)).toBe(0);
  await page.goto("/admin");
  await page.getByTestId("source-rospotrebnadzor-news").getByTestId("toggle-rospotrebnadzor-news").click();
  await expect(page.getByTestId("source-rospotrebnadzor-news").getByTestId("admin-message")).toContainText("Disabled");
});
