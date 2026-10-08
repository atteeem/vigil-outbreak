// Builds a throwaway test database before the suite: SQLite at prisma/vitest.db by default, or the PostgreSQL
// database in TEST_DATABASE_URL (`npm run test:pg`), which is wiped (schema dropped) first. Never touches dev data.
import { rmSync } from "node:fs";
import { execSync } from "node:child_process";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL || "file:./prisma/vitest.db";

export default function setup() {
  const env = { ...process.env, DATABASE_URL: TEST_DB_URL };
  if (/^postgres/i.test(TEST_DB_URL)) {
    if (!/test|vitest|ci/i.test(TEST_DB_URL)) throw new Error(`Refusing to wipe a PostgreSQL database whose URL does not mention test/ci: ${TEST_DB_URL}`);
    execSync("npx prisma db execute --stdin", { env, input: 'DROP SCHEMA IF EXISTS "public" CASCADE; CREATE SCHEMA "public";', stdio: ["pipe", "pipe", "pipe"] });
  } else {
    for (const s of ["", "-journal", "-wal", "-shm"]) rmSync(`${TEST_DB_URL.replace(/^file:/, "")}${s}`, { force: true });
  }
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
