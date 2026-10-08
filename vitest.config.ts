import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    // INGESTION_RETRY_BASE_MS keeps retry tests fast.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL || "file:./prisma/vitest.db", INGESTION_RETRY_BASE_MS: "20" },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
