// Live-source verification. Run from any machine with normal internet access:
//   npm run verify:sources                 # all configured automatic sources with a URL + diagnostic probes
//   npm run verify:sources -- --only who-don,cdc-content
//   npm run verify:sources -- --url https://... --adapter RSS   # ad-hoc check of a candidate feed
//   npm run verify:sources -- --update-db  # record results on Source (endpointStatus, lastVerification); never enables
// Writes a JSON report to reports/. Exit codes: 0 = everything verified, 2 = blocked by local network policy,
// 1 = a source failed or degraded. Nothing is stored and nothing is ever marked successful without a real response.
import "dotenv/config";
import dns from "node:dns";
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { EXTRA_PROBES, verifyEndpoint, type VerificationResult } from "../lib/ingestion/verify";
import { isLiveUrl } from "../lib/ingestion/errors";

dns.setDefaultResultOrder("ipv4first");

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const value = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const only = value("--only")?.split(",");
  const adHocUrl = value("--url");
  const targets: { slug: string; adapter: string; url: string }[] = [];
  if (adHocUrl) {
    targets.push({ slug: "ad-hoc", adapter: value("--adapter") ?? "RSS", url: adHocUrl });
  } else {
    const sources = await prisma.source.findMany({ where: { adapter: { not: "MANUAL" }, url: { not: null } }, orderBy: { slug: "asc" } });
    for (const s of sources) if (isLiveUrl(s.url) && (!only || only.includes(s.slug))) targets.push({ slug: s.slug, adapter: s.adapter, url: s.url! });
    if (!only && !flag("--no-probes")) targets.push(...EXTRA_PROBES);
  }

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  console.log(`VIGIL OUTBREAK live-source verification — ${new Date().toISOString()}`);
  console.log(`Node ${process.version}; HTTPS proxy ${proxy ? `configured (${proxy.replace(/\/\/[^@]*@/, "//***@")})` : "not configured"}\n`);

  const results: VerificationResult[] = [];
  for (const t of targets) {
    process.stdout.write(`• ${t.slug.padEnd(28)} ${t.adapter.padEnd(16)} `);
    const r = await verifyEndpoint(t.slug, t.adapter, t.url);
    results.push(r);
    console.log(`${r.verdict}${r.failureKind ? ` (${r.failureKind})` : ""}  ${r.itemCount ? `${r.itemCount} items, newest ${r.newest}` : ""}`);
    for (const c of r.checks) console.log(`    ${c.status.padEnd(4)} ${c.name.padEnd(11)} ${c.detail}`);
    if (r.hint) console.log(`    hint: ${r.hint}`);
    if (r.sample[0]) console.log(`    e.g.  ${r.sample[0].publishedAt.slice(0, 10)}  ${r.sample[0].title.slice(0, 90)}`);
  }

  if (flag("--update-db") && !adHocUrl) {
    for (const r of results) {
      const src = await prisma.source.findUnique({ where: { slug: r.slug } });
      if (!src) continue;
      const status = r.verdict === "VERIFIED" || r.verdict === "DEGRADED" ? "WORKING" : r.verdict === "BLOCKED_BY_NETWORK" ? "BLOCKED" : "FAILING";
      await prisma.source.update({ where: { id: src.id }, data: { endpointStatus: status, lastVerifiedAt: new Date(r.checkedAt), lastVerification: `${r.verdict}: ${r.checks.map((c) => `${c.name} ${c.status}`).join(", ")}`, ...(r.failureKind ? { lastErrorKind: r.failureKind } : {}) } });
    }
    console.log("\nRecorded results on Source rows (no source was enabled).");
  }

  mkdirSync("reports", { recursive: true });
  const file = `reports/source-verification-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, proxyConfigured: Boolean(proxy), results }, null, 2));
  const verified = results.filter((r) => r.verdict === "VERIFIED").length;
  const blocked = results.filter((r) => r.verdict === "BLOCKED_BY_NETWORK").length;
  console.log(`\n${verified}/${results.length} verified, ${blocked} blocked by local network policy, ${results.length - verified - blocked} failed/degraded. Report: ${file}`);
  process.exitCode = results.every((r) => r.verdict === "VERIFIED") ? 0 : blocked > 0 && results.every((r) => r.verdict === "VERIFIED" || r.verdict === "BLOCKED_BY_NETWORK") ? 2 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
