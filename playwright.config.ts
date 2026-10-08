import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { ADMIN_TEST_BYPASS_SECRET } from "./tests/e2e/bypass";

const PORT = 3100;
const TEST_DB_URL = "file:./prisma/test.db";
process.env.DATABASE_URL = TEST_DB_URL;
// Pre-installed Chromium in this environment; override with PLAYWRIGHT_CHROMIUM_PATH or unset to use Playwright's own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    extraHTTPHeaders: { "x-admin-test-bypass": ADMIN_TEST_BYPASS_SECRET },
    launchOptions: { executablePath, args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    { name: "Desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } }, testIgnore: /mobile\.spec/ },
    { name: "Mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `node scripts/prepare-test-db.mjs && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: TEST_DB_URL,
      NEXT_DIST_DIR: ".next-test",
      ADMIN_TEST_BYPASS_SECRET,
      ADMIN_PASSWORD: "e2e-password",
      ADMIN_SESSION_SECRET: "e2e-session-secret",
      TEST_FIXTURES: "true",
      DISABLE_INGESTION_SCHEDULER: "1",
    },
  },
});
