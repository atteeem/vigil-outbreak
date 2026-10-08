// Copies MapLibre's worker + shared chunk from node_modules into /public so they always match the installed
// maplibre-gl version. The main bundle and the worker exchange messages using minified internal names, so a
// worker from another version leaves the map without data. Runs on postinstall, predev and prebuild; it only
// writes when the files differ. `--check` exits 1 instead of writing.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
let dist;
try {
  dist = join(dirname(createRequire(join(root, "package.json")).resolve("maplibre-gl/package.json")), "dist");
} catch {
  console.log("[maplibre-worker] maplibre-gl is not installed yet; skipping.");
  process.exit(0);
}
const version = JSON.parse(readFileSync(join(dist, "..", "package.json"), "utf8")).version;
let stale = 0;
for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  const src = readFileSync(join(dist, name));
  const target = join(root, "public", name);
  if (existsSync(target) && readFileSync(target).equals(src)) continue;
  stale++;
  if (check) console.error(`[maplibre-worker] public/${name} does not match maplibre-gl ${version}`);
  else {
    writeFileSync(target, src);
    console.log(`[maplibre-worker] public/${name} updated to maplibre-gl ${version}`);
  }
}
if (check && stale) process.exit(1);
if (!stale) console.log(`[maplibre-worker] public worker matches maplibre-gl ${version}`);
