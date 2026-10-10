// Re-derives extraction + classification for automatically ingested articles with the current rules
// (event location vs mentioned countries, diseases, content type, outbreak relevance, suggested outbreak).
//   npm run reprocess              dry run: shows what would change, writes nothing
//   npm run reprocess -- --apply   applies the changes
//   npm run reprocess -- --apply --all   also rows already at the current classifier version
// Preserves records: nothing is deleted; review status, verification, analyst outbreak links (outbreakId),
// claims, seeded and manual articles are never modified. Only derived fields of INGESTED rows are updated.
import "dotenv/config";
import { prisma } from "../lib/db";
import { reprocessArticles } from "../lib/ingestion/reprocess";
import { tagUntrackedArticles } from "../lib/tracked/store";

const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");

reprocessArticles({ apply, all, log: (l) => console.log(l) })
  .then((r) => {
    console.log(`\n${r.examined} ingested articles examined; ${r.changed} ${apply ? "updated" : "would change"}; ${r.skipped} skipped (raw payload not re-parseable). Content types: ${Object.entries(r.byType).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}.`);
    if (!apply && r.changed) console.log("Dry run only. Re-run with --apply to write these changes.");
  })
  .then(async () => {
    // Tags articles that are about a tracked event (only the tracked* fields; nothing else changes).
    if (apply) console.log(`Tracked-event tags added: ${await tagUntrackedArticles()}.`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
