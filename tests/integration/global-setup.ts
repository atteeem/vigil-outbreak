// Builds a throwaway SQLite DB (prisma/vitest.db) from migrations + seed before the suite. Never touches dev.db.
import { rmSync } from "node:fs";
import { execSync } from "node:child_process";

export default function setup() {
  const url = "file:./prisma/vitest.db";
  for (const s of ["", "-journal", "-wal", "-shm"]) rmSync(`prisma/vitest.db${s}`, { force: true });
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
