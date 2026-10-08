// Deterministic upstream fixtures for the test suite only (VIGIL pattern). 404 unless TEST_FIXTURES=true and
// not a production build, so it can never serve fabricated data in a real deployment.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const FILES: Record<string, { file: string; type: string }> = {
  "who-don.json": { file: "who-don.json", type: "application/json" },
  "who-don-page2.json": { file: "who-don-page2.json", type: "application/json" },
  "ecdc.xml": { file: "ecdc.xml", type: "application/rss+xml" },
  "broken.json": { file: "broken.json", type: "application/json" },
};

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (process.env.TEST_FIXTURES !== "true" || process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const { name } = await ctx.params;
  if (name === "error-500") return new Response("upstream failure", { status: 500 });
  const f = FILES[name];
  if (!f) return new Response("Not found", { status: 404 });
  const body = await readFile(path.join(process.cwd(), "tests", "fixtures", f.file), "utf8");
  return new Response(body, { headers: { "content-type": f.type } });
}
