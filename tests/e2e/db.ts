// Read-only access to the Playwright database (prisma/test.db), so browser tests can assert what the UI actually
// persisted instead of trusting what the page says.
import Database from "better-sqlite3";
import path from "node:path";

let db: Database.Database | null = null;
function conn() {
  db ??= new Database(path.join(process.cwd(), "prisma", "test.db"), { readonly: true, fileMustExist: true });
  return db;
}

export function row<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return conn().prepare(sql).get(...params) as T | undefined;
}
export function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return conn().prepare(sql).all(...params) as T[];
}
export function count(sql: string, ...params: unknown[]): number {
  return Number(Object.values(row<Record<string, number>>(sql, ...params) ?? { n: 0 })[0]);
}
