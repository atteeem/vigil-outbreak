import { expect, test } from "@playwright/test";
import { count, row, rows } from "./db";
import { waitForMap } from "./helpers";

// End to end through the real UI: an official outbreak report is received → ingested → stored → reviewed →
// associated with a new outbreak record whose location the analyst enters and checks → published → shown on an
// already-open Live Map after its automatic refresh. Ingestion alone must never create, confirm or publish anything.

const FIXTURE = "http://localhost:3100/api/test-fixtures/who-don-workflow.json";
const TITLE = "Fixture: Yellow fever - Peru";
const SLUG = "e2e-yellow-fever-peru-2026";
const IQUITOS: [number, number] = [-73.2538, -3.7491];

type MapHandle = { getSource: (id: string) => { getData: () => Promise<GeoJSON.FeatureCollection> }; jumpTo: (o: unknown) => void; project: (ll: [number, number]) => { x: number; y: number } };

test("official report → ingest → review → new outbreak → verify location → publish → Live Map", async ({ page, context }) => {
  test.setTimeout(240_000);
  const outbreaksBefore = count("SELECT COUNT(*) FROM Outbreak");
  const observationsBefore = count("SELECT COUNT(*) FROM OutbreakObservation");

  // A visitor already has the Live Map open.
  const viewer = await context.newPage();
  await viewer.goto("/global/map");
  const viewerMap = await waitForMap(viewer);
  const markersBefore = Number(await viewerMap.getAttribute("data-marker-count"));
  await expect(viewer.getByTestId(`outbreak-item-${SLUG}`)).toHaveCount(0);

  // 1. Receive: point the WHO DON source at the official-report fixture, test, enable, fetch.
  await page.goto("/admin");
  const who = page.getByTestId("source-who-don");
  await who.getByRole("textbox", { name: /URL/ }).fill(FIXTURE);
  await who.getByRole("button", { name: "Save" }).click();
  await expect(who.getByTestId("admin-message")).toHaveText("Saved.");
  await who.getByTestId("test-who-don").click();
  await expect(who.getByTestId("admin-message")).toContainText("Endpoint OK — 1 items parsed");
  if ((await who.getByTestId("toggle-who-don").innerText()) === "Enable") {
    await who.getByTestId("toggle-who-don").click();
    await expect(who.getByTestId("admin-message")).toContainText("Enabled");
  }
  await who.getByTestId("fetch-who-don").click();
  await expect(who.getByTestId("admin-message")).toContainText("1 new", { timeout: 30_000 });

  // 2. Stored: one unreviewed, unverified official article with its extracted location; claims unverified;
  //    no outbreak, observation or classification created by ingestion.
  const art = row<{ id: string; reviewStatus: string; verificationStatus: string; origin: string; sourceType: string; countryCodes: string; diseaseSlugs: string; outbreakId: string | null; suggestedOutbreakId: string | null; outbreakRelevant: number }>("SELECT * FROM SourceArticle WHERE title = ?", TITLE)!;
  expect(art).toMatchObject({ reviewStatus: "PENDING", verificationStatus: "UNVERIFIED", origin: "INGESTED", sourceType: "OFFICIAL", outbreakId: null, suggestedOutbreakId: null, outbreakRelevant: 1 });
  expect(JSON.parse(art.countryCodes)).toEqual(["PE"]);
  expect(JSON.parse(art.diseaseSlugs)).toContain("yellow-fever");
  const claims = rows<{ verificationStatus: string }>("SELECT verificationStatus FROM EvidenceClaim WHERE articleId = ?", art.id);
  expect(claims.length).toBeGreaterThan(0);
  expect(claims.every((c) => c.verificationStatus === "UNVERIFIED")).toBe(true);
  expect(count("SELECT COUNT(*) FROM Outbreak")).toBe(outbreaksBefore);
  expect(count("SELECT COUNT(*) FROM OutbreakObservation")).toBe(observationsBefore);

  // 3. Review: the article is in the queue with its detected location and no matching outbreak.
  await page.goto("/admin/review");
  const card = page.getByTestId("review-article").filter({ hasText: TITLE });
  await expect(card).toContainText("Event location: PE");
  await expect(card).toContainText("No matching outbreak detected");

  // 4. Associate with a NEW outbreak: the analyst creates it (unpublished) with the location from the report,
  //    as a suspected outbreak — the report says laboratory confirmation is pending.
  await page.goto("/admin/outbreaks");
  const form = page.getByTestId("create-outbreak");
  await form.getByLabel("Slug").fill(SLUG);
  await form.getByLabel("Title").fill("Suspected yellow fever — Peru (e2e)");
  await form.getByLabel("Summary").fill("Peru notified WHO of 6 suspected yellow fever cases, including 2 deaths, in Iquitos, Loreto. Laboratory confirmation pending.");
  await form.getByLabel("Classification").selectOption("SUSPECTED_OUTBREAK");
  await form.getByLabel("Pathogen status").selectOption("SUSPECTED");
  await form.getByLabel("Suspected disease").selectOption({ label: "Yellow fever" });
  await form.getByLabel("Country").selectOption("PE");
  await form.getByLabel("Place name").fill("Iquitos, Loreto");
  await form.getByLabel("Latitude").fill(String(IQUITOS[1]));
  await form.getByLabel("Longitude").fill(String(IQUITOS[0]));
  await form.getByLabel("Precision").selectOption("CITY");
  await form.getByRole("button", { name: "Create (unpublished)" }).click();
  await expect(page).toHaveURL(/\/admin\/outbreaks\/[a-z0-9]+$/, { timeout: 15_000 });
  const ob = row<{ id: string; published: number; classification: string; pathogenStatus: string; diseaseId: string | null }>("SELECT * FROM Outbreak WHERE slug = ?", SLUG)!;
  expect(ob).toMatchObject({ published: 0, classification: "SUSPECTED_OUTBREAK", pathogenStatus: "SUSPECTED", diseaseId: null });
  // Verify location: stored exactly as entered, in the country the report names.
  const loc = row<{ lat: number; lng: number; countryCode: string; precision: string; role: string }>("SELECT * FROM OutbreakLocation WHERE outbreakId = ?", ob.id)!;
  expect(loc).toMatchObject({ lat: IQUITOS[1], lng: IQUITOS[0], countryCode: "PE", precision: "CITY", role: "INVESTIGATION_SITE" });
  expect(JSON.parse(art.countryCodes)).toContain(loc.countryCode);
  // Unpublished: not public.
  expect((await page.request.get(`/api/outbreaks/${SLUG}`)).status()).toBe(404);

  // Link the article to it and accept.
  await page.goto("/admin/review");
  await card.getByLabel("Link to outbreak").selectOption({ label: "Suspected yellow fever — Peru (e2e)" });
  await card.getByTestId("accept-article").click();
  await expect(card).toHaveCount(0);
  expect(row("SELECT reviewStatus, outbreakId, verificationStatus FROM SourceArticle WHERE id = ?", art.id)).toMatchObject({ reviewStatus: "ACCEPTED", outbreakId: ob.id, verificationStatus: "UNVERIFIED" });

  // Still not on the map before publication.
  const pre = await (await page.request.get("/api/dashboard")).json();
  expect(pre.outbreaks.some((o: { slug: string }) => o.slug === SLUG)).toBe(false);

  // 5. Publish.
  await page.goto(`/admin/outbreaks/${ob.id}`);
  await page.getByTestId("toggle-publish").click();
  await expect(page.getByTestId("admin-message")).toContainText("Published");
  expect(row<{ published: number }>("SELECT published FROM Outbreak WHERE id = ?", ob.id)!.published).toBe(1);

  // 6. The already-open Live Map picks it up on its automatic refresh (every 60 s), without a reload.
  await expect(viewer.getByTestId(`outbreak-item-${SLUG}`)).toBeVisible({ timeout: 90_000 });
  await expect(viewerMap).toHaveAttribute("data-marker-count", String(markersBefore + 1));
  const feature = await viewer.evaluate(async (slug) => {
    const fc = await (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.getSource("outbreaks").getData();
    const f = fc.features.find((x) => (x.properties as { slug: string }).slug === slug)!;
    return { props: f.properties, coords: (f.geometry as GeoJSON.Point).coordinates };
  }, SLUG);
  expect(feature.coords).toEqual(IQUITOS);
  expect(feature.props).toMatchObject({ classification: "SUSPECTED_OUTBREAK", precision: "CITY" });
  expect(feature.props).not.toHaveProperty("cases"); // no confirmed count → default marker size

  // Click the marker on the map: the detail panel shows a suspected outbreak with no confirmed cases.
  await viewer.evaluate((c) => (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.jumpTo({ center: c, zoom: 5 }), IQUITOS);
  await viewer.waitForTimeout(1200);
  const box = (await viewerMap.boundingBox())!;
  const pt = await viewer.evaluate((c) => (window as unknown as { __outbreakMap: MapHandle }).__outbreakMap.project(c), IQUITOS);
  await viewer.mouse.click(box.x + pt.x, box.y + pt.y);
  const panel = viewer.getByTestId("detail-panel");
  await expect(panel.getByTestId("detail-title")).toContainText("Peru", { timeout: 10_000 });
  await expect(panel.getByTestId("classification-badge")).toHaveText(/Suspected outbreak/);
  await expect(panel.getByTestId("stat-confirmed")).toContainText("Not reported");

  const pub = await (await page.request.get(`/api/outbreaks/${SLUG}`)).json();
  expect(pub.cases.confirmedCases).toBeNull();
  expect(pub.classification).toBe("SUSPECTED_OUTBREAK");
});
