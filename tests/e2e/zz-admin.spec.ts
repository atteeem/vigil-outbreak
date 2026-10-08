import { expect, test } from "@playwright/test";

test.describe("admin protection", () => {
  test.use({ extraHTTPHeaders: {} });
  test("admin pages and APIs require authentication", async ({ page, request }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/);
    for (const [method, url] of [["POST", "/api/admin/ingest"], ["GET", "/api/admin/sources"], ["PATCH", "/api/admin/outbreaks/x"], ["GET", "/api/admin/audit"]] as const) {
      const r = await request.fetch(url, { method, data: method === "GET" ? undefined : {} });
      expect(r.status(), url).toBe(401);
    }
    expect((await request.post("/api/admin/login", { data: { password: "wrong" } })).status()).toBe(401);
    expect((await request.get("/api/admin/sources", { headers: { "x-admin-test-bypass": "nope" } })).status()).toBe(401);
  });

  test("login with the password grants access", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Password").fill("e2e-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sources & ingestion" })).toBeVisible();
  });
});

test.describe("ingestion via admin", () => {
  test("Fetch Now stores items, deduplicates on re-fetch, and logs failures", async ({ page, request }) => {
    const create = await request.post("/api/admin/sources", { data: { slug: "e2e-who", name: "E2E WHO fixture", organization: "WHO (fixture)", kind: "OFFICIAL", adapter: "WHO_DON_API", url: "http://localhost:3100/api/test-fixtures/who-don.json", enabled: true } });
    expect(create.status()).toBe(201);
    await request.post("/api/admin/sources", { data: { slug: "e2e-down", name: "E2E failing", organization: "Nobody", kind: "OFFICIAL", adapter: "RSS", url: "http://localhost:3100/api/test-fixtures/error-500", enabled: true } });
    // Disable the real WHO source so this test never depends on external network.
    const sources = (await (await request.get("/api/admin/sources")).json()).sources as { id: string; slug: string }[];
    await request.patch(`/api/admin/sources/${sources.find((s) => s.slug === "who-don")!.id}`, { data: { enabled: false } });

    await page.goto("/admin");
    await page.getByTestId("fetch-e2e-who").click();
    await expect(page.getByTestId("admin-message").first()).toContainText("2 new", { timeout: 30_000 });
    await page.reload();
    await page.getByTestId("fetch-e2e-who").click();
    await expect(page.getByTestId("admin-message").first()).toContainText("0 new, 2 duplicates", { timeout: 30_000 });

    await page.getByTestId("fetch-all").click();
    const results = page.getByTestId("fetch-results");
    await expect(results).toContainText("E2E failing: FAILED", { timeout: 30_000 });
    await expect(results).toContainText("HTTP 500");

    await page.goto("/admin/logs");
    await expect(page.getByTestId("runs-table")).toContainText("E2E failing");
    await expect(page.getByTestId("runs-table")).toContainText("FAILED");

    // Persisted and visible: official publication appears in the public feed, awaiting review.
    await page.goto("/intelligence?q=Fixture");
    await expect(page.getByTestId("feed-list")).toContainText("Fixture: Cholera");
    await expect(page.getByTestId("feed-list")).toContainText("awaiting review");
  });

  test("review: accepting links article; promoting a media claim never becomes a confirmed headline", async ({ page, request }) => {
    await page.goto("/admin/review");
    const card = page.getByTestId("review-article").filter({ hasText: "Fixture: Pneumonia of unknown origin" });
    await expect(card).toContainText("Suggested outbreak");
    await card.getByTestId("accept-article").click();
    await expect(card).toHaveCount(0); // leaves the pending queue
    await page.goto("/admin/review?status=ACCEPTED");
    await expect(page.getByTestId("review-article").filter({ hasText: "Fixture: Pneumonia of unknown origin" })).toBeVisible();

    // Promote the fixture's "200 people under observation" claim as if it were confirmed cases — via API, as a
    // stress test: it stays OFFICIAL-but-UNVERIFIED and must not reach the confirmed headline.
    const ru = (await (await request.get("/api/admin/outbreaks")).json()).outbreaks.find((o: { slug: string }) => o.slug === "russia-irkutsk-2026");
    const detail = (await (await request.get(`/api/admin/outbreaks/${ru.id}`)).json()).outbreak;
    const claim = detail.claims.find((c: { metric: string; value: number; sourceType: string }) => c.metric === "UNDER_OBSERVATION" && c.value === 200 && c.sourceType === "OFFICIAL");
    expect(claim).toBeTruthy();
    const promoted = await request.patch(`/api/admin/claims/${claim.id}`, { data: { promote: { outbreakId: ru.id, metric: "CONFIRMED_CASES" } } });
    expect(promoted.status()).toBe(200);
    const pub = await (await request.get("/api/outbreaks/russia-irkutsk-2026")).json();
    expect(pub.cases.confirmedCases).toBeNull();
    expect(pub.cases.reportedUnverified.CONFIRMED_CASES.value).toBe(200);

    // A MEDIA observation, even verified, also cannot reach the headline.
    await request.post(`/api/admin/outbreaks/${ru.id}/observations`, { data: { metric: "CONFIRMED_CASES", value: 5, reportedAt: new Date().toISOString(), sourceType: "MEDIA", verificationStatus: "VERIFIED", attributedTo: "e2e media" } });
    const pub2 = await (await request.get("/api/outbreaks/russia-irkutsk-2026")).json();
    expect(pub2.cases.confirmedCases).toBeNull();
  });

  test("reclassification keeps history; resolved investigation stays available; publish toggle works", async ({ page, request }) => {
    const created = await request.post("/api/admin/outbreaks", { data: { slug: "e2e-investigation", title: "E2E unexplained illness investigation", summary: "Test record for reclassification flow.", classification: "UNCONFIRMED_INVESTIGATION", pathogenStatus: "UNKNOWN", countryCode: "FI", firstReportedAt: "2026-10-01T00:00:00.000Z", location: { name: "Helsinki", countryCode: "FI", lat: 60.17, lng: 24.94, precision: "CITY", role: "INVESTIGATION_SITE" }, published: false } });
    expect(created.status()).toBe(201);
    const { outbreak } = await created.json();
    expect((await request.get("/api/outbreaks/e2e-investigation")).status()).toBe(404);
    // A confirmed classification without a confirmed pathogen is rejected.
    expect((await request.post(`/api/admin/outbreaks/${outbreak.id}/classification`, { data: { classification: "CONFIRMED_LOCALIZED", pathogenStatus: "UNKNOWN", reason: "should be rejected by validation" } })).status()).toBe(422);

    await page.goto(`/admin/outbreaks/${outbreak.id}`);
    await page.getByTestId("toggle-publish").click();
    await expect(page.getByTestId("admin-message")).toContainText("Published");
    const form = page.getByTestId("reclassify-form");
    await form.getByLabel("New classification").selectOption("RESOLVED");
    await form.getByLabel("New pathogen status").selectOption("RULED_OUT");
    await form.getByLabel("Reason").fill("Investigators ruled out an infectious cause (e2e).");
    await form.getByRole("button", { name: "Apply reclassification" }).click();
    await expect(page.getByTestId("admin-message")).toContainText("Reclassified");

    await page.goto("/outbreaks/e2e-investigation");
    await expect(page.getByTestId("classification-badge").first()).toHaveText(/Resolved/);
    await expect(page.getByTestId("section-status-history")).toContainText("Unconfirmed investigation → Resolved");
    await expect(page.getByTestId("section-status-history")).toContainText("Record created");

    await page.goto("/admin/audit");
    await expect(page.getByTestId("audit-table")).toContainText("outbreak.reclassify");
    await expect(page.getByTestId("audit-table")).toContainText("outbreak.publish");
  });

  test("merging a duplicate moves evidence and keeps a pointer", async ({ request }) => {
    const mk = async (slug: string) => (await (await request.post("/api/admin/outbreaks", { data: { slug, title: `E2E ${slug} record`, summary: "Duplicate merge test record.", classification: "SUSPECTED_OUTBREAK", pathogenStatus: "SUSPECTED", countryCode: "SE", firstReportedAt: "2026-10-02T00:00:00.000Z", published: true } })).json()).outbreak;
    const a = await mk("e2e-dup-a");
    const b = await mk("e2e-dup-b");
    await request.post(`/api/admin/outbreaks/${a.id}/updates`, { data: { kind: "DEVELOPMENT", title: "Evidence on A", body: "moved", publishedAt: "2026-10-03T00:00:00.000Z", sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "e2e" } });
    const r = await request.post(`/api/admin/outbreaks/${a.id}/merge`, { data: { targetId: b.id, reason: "Same event reported twice" } });
    expect(r.status()).toBe(200);
    expect((await r.json()).moved.updates).toBe(1);
    expect((await request.get("/api/outbreaks/e2e-dup-a")).status()).toBe(404);
    const bPub = await (await request.get("/api/outbreaks/e2e-dup-b")).json();
    expect(bPub.updates.map((u: { title: string }) => u.title)).toContain("Evidence on A");
  });
});
