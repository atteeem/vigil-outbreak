// Runs the Vitest suite against PostgreSQL:  TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/vigil_test npm run test:pg
// Generates the PostgreSQL Prisma client, runs the tests, then always restores the SQLite client for local dev.
import { spawnSync } from "node:child_process";
import "dotenv/config";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/^postgres/i.test(url)) {
  console.error("Set TEST_DATABASE_URL to a disposable PostgreSQL database (its name must contain 'test'), e.g. postgresql://postgres@localhost:5432/vigil_test");
  process.exit(1);
}
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const opts = (dbUrl) => ({ stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, DATABASE_URL: dbUrl } });
let code = 1;
try {
  if (spawnSync(npx, ["prisma", "generate"], opts(url)).status !== 0) throw new Error("prisma generate (postgresql) failed");
  code = spawnSync(npx, ["vitest", "run", ...process.argv.slice(2)], opts(url)).status ?? 1;
} finally {
  spawnSync(npx, ["prisma", "generate"], opts(process.env.LOCAL_DATABASE_URL || "file:./prisma/dev.db"));
}
process.exit(code);
