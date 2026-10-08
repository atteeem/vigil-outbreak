// Migration reproducibility check (cross-platform; run in CI and before deploying).
//  1. prisma/postgres/schema.prisma is in sync with the canonical schema.
//  2. SQLite: replaying prisma/migrations yields exactly prisma/schema.prisma (no drift, no missing migration).
//  3. The database at DATABASE_URL (SQLite or PostgreSQL) matches its schema (all migrations applied, no manual edits).
import { execFileSync } from "node:child_process";
import path from "node:path";
import "dotenv/config";

const root = process.cwd();
const prismaBin = path.join(root, "node_modules", "prisma", "build", "index.js");
let failed = false;

function run(label, args, env = process.env) {
  try {
    execFileSync(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    console.log(`PASS  ${label}`);
  } catch (e) {
    failed = true;
    const code = e.status;
    console.log(`FAIL  ${label}${code === 2 ? " — differences found" : ""}`);
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.split("\n").filter((l) => l && !/^Loaded Prisma config/.test(l)).slice(0, 15).join("\n");
    if (out) console.log(out.replace(/^/gm, "      "));
  }
}

run("PostgreSQL schema generated from canonical schema", [path.join(root, "scripts", "db-pg-sync.mjs"), "--check"]);
run("SQLite migrations reproduce prisma/schema.prisma", [prismaBin, "migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", "prisma/schema.prisma", "--exit-code"], { ...process.env, DATABASE_URL: "file:./prisma/.db-check.db" });
if (process.env.DATABASE_URL) {
  const pg = /^postgres/i.test(process.env.DATABASE_URL);
  run(`Database at DATABASE_URL (${pg ? "postgresql" : "sqlite"}) matches its schema`, [prismaBin, "migrate", "diff", "--from-config-datasource", "--to-schema", pg ? "prisma/postgres/schema.prisma" : "prisma/schema.prisma", "--exit-code"]);
}
process.exitCode = failed ? 1 : 0;
