import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 20000,
    fileParallelism: false,
    env: { NODE_ENV: "test" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
