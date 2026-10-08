import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 driver-adapter model (VIGIL pattern). DATABASE_URL picks the database:
//   file:./prisma/dev.db        -> SQLite via better-sqlite3 (local development, tests)
//   postgresql://user@host/db   -> PostgreSQL via node-postgres (production)
// The generated client must match: run `npm run db:generate` after changing DATABASE_URL's flavour
// (prisma.config.ts selects the matching schema from the same variable).
export const DATABASE_URL = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
export const isPostgres = /^postgres(ql)?:\/\//i.test(DATABASE_URL);

/** Creates a client for any URL (used for the default client and by tools that need a second database). */
export function createPrismaClient(url: string = DATABASE_URL) {
  if (/^postgres(ql)?:\/\//i.test(url)) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX) || 10 }) });
  }
  // better-sqlite3 takes a plain path, not a `file:` URI.
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: url.replace(/^file:/, "") }) });
  // WAL keeps ingestion writes from stalling page reads on the single SQLite connection.
  void client
    .$queryRawUnsafe("PRAGMA journal_mode = WAL")
    .then(() => client.$queryRawUnsafe("PRAGMA synchronous = NORMAL"))
    .catch(() => undefined);
  return client;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Case-insensitive `contains`: SQLite LIKE is already case-insensitive for ASCII; PostgreSQL needs mode. */
export function containsCI(term: string) {
  return (isPostgres ? { contains: term, mode: "insensitive" } : { contains: term }) as { contains: string };
}
