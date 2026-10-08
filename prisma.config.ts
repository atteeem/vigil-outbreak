// Prisma 7 config. The datasource URL decides the database flavour:
//   file:...            -> SQLite, canonical schema prisma/schema.prisma + prisma/migrations (local development)
//   postgres(ql)://...  -> PostgreSQL, generated schema prisma/postgres/schema.prisma + prisma/postgres/migrations
// So `prisma generate` / `prisma migrate deploy` pick the right schema automatically from DATABASE_URL.
// The runtime client connects via a driver adapter chosen the same way (lib/db.ts).
import { defineConfig } from "prisma/config";
import "dotenv/config";

// Falls back to the local SQLite file so `npm install` (postinstall: prisma generate) works before .env exists.
const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
const isPostgres = /^postgres(ql)?:\/\//i.test(url);

export default defineConfig({
  schema: isPostgres ? "prisma/postgres/schema.prisma" : "prisma/schema.prisma",
  migrations: { path: isPostgres ? "prisma/postgres/migrations" : "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url },
});
