// One-shot ingestion from the command line (cron-friendly): `npm run ingest` or `npm run ingest -- --due`.
import "dotenv/config";
import dns from "node:dns";
import { runAll } from "../lib/ingestion/pipeline";
import { prisma } from "../lib/db";

dns.setDefaultResultOrder("ipv4first");

const onlyDue = process.argv.includes("--due");
const pagesArg = process.argv.indexOf("--pages");
const maxPages = pagesArg >= 0 ? Math.min(20, Math.max(1, Number(process.argv[pagesArg + 1]) || 1)) : 1;
runAll("CLI", { onlyDue, maxPages })
  .then((results) => {
    if (results.length === 0) console.log("No enabled automatic sources" + (onlyDue ? " are due." : "."));
    for (const r of results) console.log(`${r.status.padEnd(8)} ${r.sourceName}: fetched=${r.itemsFetched} new=${r.itemsNew} duplicate=${r.itemsDuplicate} failed=${r.itemsFailed}${r.error ? ` kind=${r.failureKind} error="${r.error}"` : ""}`);
    process.exitCode = results.some((r) => r.status === "FAILED") ? 2 : 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
