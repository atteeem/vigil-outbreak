// Derives the PostgreSQL Prisma schema from the canonical SQLite schema (models are identical).
export function toPostgres(src) {
  if (!/provider\s*=\s*"sqlite"/.test(src)) throw new Error('Canonical schema must use provider = "sqlite"');
  return (
    "// GENERATED from prisma/schema.prisma by `npm run db:pg:sync` — do not edit by hand.\n" +
    "// PostgreSQL schema for production. Models are identical to the canonical SQLite schema.\n\n" +
    src.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')
  );
}
