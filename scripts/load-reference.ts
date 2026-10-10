// Non-destructive reference-data refresh: upserts the disease list (names, agents, extractor keywords) and makes
// sure the tracked-event configuration exists (Irkutsk investigation as the primary subject, its precautionary
// location, the Rospotrebnadzor source, tracked-article tags). Never deletes or overwrites analyst work.
//   npm run db:reference
import "dotenv/config";
import { prisma } from "../lib/db";
import { DISEASES } from "../prisma/reference/diseases";
import { ensureTrackedEvents } from "../lib/tracked/store";

async function main() {
  let created = 0;
  let updated = 0;
  for (const d of DISEASES) {
    const data = { ...d, keywords: JSON.stringify(d.keywords) };
    const existing = await prisma.disease.findUnique({ where: { slug: d.slug }, select: { id: true } });
    await prisma.disease.upsert({ where: { slug: d.slug }, update: data, create: data });
    if (existing) updated++;
    else created++;
  }
  await prisma.adminAuditLog.create({ data: { action: "reference.diseases", entityType: "system", details: JSON.stringify({ created, updated }), actor: "cli" } });
  console.log(`Diseases: ${created} added, ${updated} refreshed (${DISEASES.length} total).`);
  const tracked = await ensureTrackedEvents();
  if (tracked.length) await prisma.adminAuditLog.create({ data: { action: "reference.tracked", entityType: "system", details: JSON.stringify(tracked), actor: "cli" } });
  console.log(tracked.length ? `Tracked events: ${tracked.join("; ")}.` : "Tracked events: already configured.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
