import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: { lines: 55, functions: 60, statements: 55, branches: 50 },
    },
  },
});
