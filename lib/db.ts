import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Prisma 7 driver-adapter model (same pattern as VIGIL): better-sqlite3 takes a plain path, not a `file:` URI.
function createPrismaClient() {
  const url = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "");
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
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
