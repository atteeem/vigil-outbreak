// Real-source verification (Windows, macOS, Linux — Node 22+, no shell or sandbox dependencies).
//
//   npm run verify:sources                       full pipeline check of WHO DON, CDC Content Services and every feed
//                                                listed on ECDC's official RSS page
//   npm run verify:sources -- --only who-don     one target (who-don | cdc-content | ecdc)
//   npm run verify:sources -- --url <feed> --adapter RSS|WHO_DON_API|CDC_CONTENT_API
//   npm run verify:sources -- --endpoint-only    reachability/schema/paging only (does NOT prove ingestion works)
//   npm run verify:sources -- --update-db        record the verdicts on matching sources in your main database
//   npm run verify:sources -- --pages 2          pages to ingest per source (default 1)
//
// A source is PIPELINE_VERIFIED only if real records were retrieved, parsed, stored, had dates/geography/disease
// extracted, and a second run stored nothing new. Ingestion runs in a THROWAWAY SQLite database
// (prisma/verify.db, recreated each run) — your working database is never written unless --update-db is given,
// and even then only the verification fields of existing sources are updated (nothing is enabled).
// Exit code: 0 all verified · 2 everything not verified was blocked by the local network · 1 any other failure.
import "dotenv/config";
import dns from "node:dns";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

dns.setDefaultResultOrder("ipv4first");

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const value = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const ROOT = process.cwd();
const MAIN_DB_URL = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const VERIFY_DB_FILE = path.join("prisma", "verify.db");
const VERIFY_DB_URL = `file:./${VERIFY_DB_FILE.replace(/\\/g, "/")}`;

const WHO_URL = "https://www.who.int/api/news/diseaseoutbreaknews";
const CDC_URL = "https://tools.cdc.gov/api/v2/resources/media?q=outbreak&max=50";
const ECDC_INDEX = "https://www.ecdc.europa.eu/en/rss-feeds";
const ECDC_FALLBACK = "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed"; // third-party-reported News feed

function node(scriptRel: string, scriptArgs: string[], env: NodeJS.ProcessEnv) {
  execFileSync(process.execPath, [path.join(ROOT, scriptRel), ...scriptArgs], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
}

function prepareThrowawayDb() {
  for (const s of ["", "-journal", "-wal", "-shm"]) rmSync(`${VERIFY_DB_FILE}${s}`, { force: true });
  const env = { ...process.env, DATABASE_URL: VERIFY_DB_URL };
  try {
    node("node_modules/prisma/build/index.js", ["migrate", "deploy"], env);
    node("node_modules/tsx/dist/cli.mjs", ["prisma/seed.ts"], env);
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    throw new Error(`Could not prepare the throwaway verification database: ${(err.stderr || err.stdout || err.message).slice(0, 800)}`);
  }
}

async function main() {
  const endpointOnly = flag("--endpoint-only");
  const only = value("--only")?.split(",");
  const maxPages = Math.min(5, Math.max(1, Number(value("--pages")) || 1));
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  console.log(`VIGIL OUTBREAK real-source verification — ${new Date().toISOString()}`);
  console.log(`Node ${process.version} on ${process.platform}; HTTPS proxy ${proxy ? "configured" : "not configured"}; mode ${endpointOnly ? "endpoint-only (does not prove ingestion)" : "full pipeline"}\n`);

  // The pipeline code must bind to the throwaway database, so it is imported only after DATABASE_URL is switched.
  if (!endpointOnly) {
    if (/^file:/.test(MAIN_DB_URL) && path.resolve(MAIN_DB_URL.replace(/^file:/, "")) === path.resolve(VERIFY_DB_FILE)) throw new Error("DATABASE_URL must not point at prisma/verify.db");
    process.stdout.write("Preparing throwaway database prisma/verify.db (migrations + reference data)… ");
    prepareThrowawayDb();
    console.log("done\n");
  }
  process.env.DATABASE_URL = endpointOnly ? MAIN_DB_URL : VERIFY_DB_URL;
  const { verifyEndpoint } = await import("../lib/ingestion/verify");
  const { verifyPipeline } = await import("../lib/ingestion/pipeline-verify");
  const { fetchText } = await import("../lib/ingestion/http");
  const { parseFeedLinks } = await import("../lib/ingestion/discover");
  const { IngestionError } = await import("../lib/ingestion/types");
  const { prisma, createPrismaClient } = await import("../lib/db");

  type Target = { slug: string; adapter: string; url: string; label: string; note?: string };
  const targets: Target[] = [];
  const notes: string[] = [];
  const want = (s: string) => !only || only.includes(s);

  if (value("--url")) {
    targets.push({ slug: "ad-hoc", adapter: value("--adapter") ?? "RSS", url: value("--url")!, label: "ad-hoc URL" });
  } else {
    if (want("who-don")) targets.push({ slug: "who-don", adapter: "WHO_DON_API", url: WHO_URL, label: "WHO Disease Outbreak News" });
    if (want("cdc-content")) targets.push({ slug: "cdc-content", adapter: "CDC_CONTENT_API", url: CDC_URL, label: "CDC Content Services (q=outbreak)" });
    if (want("ecdc")) {
      // Feeds are taken from ECDC's own RSS page, so only officially listed feeds are verified.
      try {
        const page = await fetchText(ECDC_INDEX, "text/html");
        const feeds = parseFeedLinks(page.body, ECDC_INDEX);
        const max = Number(value("--ecdc-max")) || 12;
        if (feeds.length === 0) notes.push(`ECDC: ${ECDC_INDEX} was reachable but no feed links were found — page layout may have changed. Checked fallback ${ECDC_FALLBACK} instead.`);
        feeds.slice(0, max).forEach((f, i) => targets.push({ slug: `ecdc-${i + 1}`, adapter: "RSS", url: f.url, label: `ECDC: ${f.label}`, note: "listed on ECDC's official RSS page" }));
        if (feeds.length > max) notes.push(`ECDC lists ${feeds.length} feeds; checked the first ${max} (raise with --ecdc-max).`);
        if (feeds.length === 0) targets.push({ slug: "ecdc-news", adapter: "RSS", url: ECDC_FALLBACK, label: "ECDC News (fallback URL)" });
      } catch (err) {
        const kind = err instanceof IngestionError ? err.kind : "UNKNOWN";
        notes.push(`ECDC feed discovery failed (${kind}): ${(err as Error).message}. Checked the fallback News feed URL instead.`);
        targets.push({ slug: "ecdc-news", adapter: "RSS", url: ECDC_FALLBACK, label: "ECDC News (fallback URL; not confirmed on ECDC's page)" });
      }
    }
  }

  const results = [];
  for (const t of targets) {
    console.log(`▶ ${t.label}\n  ${t.adapter}  ${t.url}${t.note ? `\n  (${t.note})` : ""}`);
    if (endpointOnly) {
      const r = await verifyEndpoint(t.slug, t.adapter, t.url);
      results.push({ ...t, verdict: r.verdict === "VERIFIED" ? "ENDPOINT_OK" : r.verdict, failureKind: r.failureKind, endpoint: r, stages: r.checks });
      for (const c of r.checks) console.log(`    ${c.status.padEnd(4)} ${c.name.padEnd(11)} ${c.detail}`);
      console.log(`  → ${r.verdict === "VERIFIED" ? "ENDPOINT_OK (ingestion NOT verified — run without --endpoint-only)" : r.verdict}${r.hint ? `\n    hint: ${r.hint}` : ""}\n`);
      continue;
    }
    const r = await verifyPipeline({ slug: t.slug, adapter: t.adapter, url: t.url, label: t.label }, { maxPages });
    results.push({ ...t, ...r });
    for (const c of r.stages) console.log(`    ${c.status.padEnd(4)} ${c.name.padEnd(12)} ${c.detail}`);
    if (r.verdict !== "PIPELINE_VERIFIED") for (const c of r.endpoint.checks.filter((x) => x.status !== "PASS")) console.log(`         · ${c.name}: ${c.detail}`);
    if (r.endpoint.hint) console.log(`    hint: ${r.endpoint.hint}`);
    for (const s of r.samples.slice(0, 3)) console.log(`    e.g. ${s.publishedAt.slice(0, 10)}  [${s.countries.join(",") || "—"}] [${s.diseases.join(",") || "—"}]  ${s.title.slice(0, 80)}`);
    console.log(`  → ${r.verdict}${r.failedStage ? ` (failed at: ${r.failedStage})` : ""}\n`);
  }

  if (flag("--update-db") && !value("--url")) {
    const main = endpointOnly ? prisma : createPrismaClient(MAIN_DB_URL);
    const bySlug: Record<string, string> = { "who-don": "who-don", "cdc-content": "cdc-content" };
    for (const r of results) {
      const slug = bySlug[r.slug] ?? (r.url === ECDC_FALLBACK ? "ecdc-news" : null);
      const src = slug ? await main.source.findUnique({ where: { slug } }) : await main.source.findFirst({ where: { url: r.url } });
      if (!src) continue;
      const verified = r.verdict === "PIPELINE_VERIFIED";
      await main.source.update({ where: { id: src.id }, data: { endpointStatus: verified ? "WORKING" : r.verdict === "BLOCKED_BY_NETWORK" ? "BLOCKED" : r.verdict === "ENDPOINT_OK" ? src.endpointStatus : "FAILING", lastVerifiedAt: new Date(), lastVerification: `${r.verdict}: ${r.stages.map((c) => `${c.name} ${c.status}`).join(", ")}`, ...(r.failureKind ? { lastErrorKind: r.failureKind } : {}) } });
      console.log(`Recorded ${r.verdict} on source "${src.slug}" in ${MAIN_DB_URL.replace(/\/\/[^@]*@/, "//***@")} (not enabled).`);
    }
    if (main !== prisma) await main.$disconnect();
  }

  mkdirSync("reports", { recursive: true });
  const file = path.join("reports", `source-verification-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, platform: process.platform, proxyConfigured: Boolean(proxy), mode: endpointOnly ? "endpoint-only" : "pipeline", notes, results }, null, 2));

  const ok = endpointOnly ? "ENDPOINT_OK" : "PIPELINE_VERIFIED";
  const verified = results.filter((r) => r.verdict === ok).length;
  const blocked = results.filter((r) => r.verdict === "BLOCKED_BY_NETWORK").length;
  for (const n of notes) console.log(`note: ${n}`);
  console.log("\nSummary");
  for (const r of results) console.log(`  ${String(r.verdict).padEnd(19)} ${r.label}${r.failureKind ? ` — ${r.failureKind}` : ""}`);
  console.log(`\n${verified}/${results.length} ${endpointOnly ? "endpoints reachable (ingestion not tested)" : "sources verified end-to-end"}; ${blocked} blocked by local network policy. Report: ${file}`);
  await prisma.$disconnect();
  process.exitCode = results.length > 0 && verified === results.length ? 0 : blocked > 0 && results.every((r) => r.verdict === ok || r.verdict === "BLOCKED_BY_NETWORK") ? 2 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
