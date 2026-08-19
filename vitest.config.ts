import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 20000,
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // The suite signs in many times from one address on purpose; the strict
      // production default would throttle it. Only the test run is relaxed.
      LOGIN_RATE_LIMIT_MAX: "1000",
      SUPPORT_RATE_LIMIT_MAX: "1000",
      SUPPORT_CREATE_RATE_LIMIT_MAX: "1000",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
