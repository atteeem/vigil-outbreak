// Fresh throwaway DB for the Playwright server (VIGIL pattern). Refuses to touch anything but prisma/test.db.
import { rmSync } from "node:fs";
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url || !/test\.db$/.test(url)) {
  console.error(`Refusing to reset a non-test database (DATABASE_URL=${url}).`);
  process.exit(1);
}
const file = url.replace(/^file:/, "");
for (const s of ["", "-journal", "-wal", "-shm"]) rmSync(`${file}${s}`, { force: true });
execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: process.env });
