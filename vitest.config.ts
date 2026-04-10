import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(new URL(import.meta.url)));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir
    }
  },
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/**/*.ts"],
      exclude: [
        "**/__tests__/**",
        "**/*.test.ts",
        "lib/db/client.ts",
        "lib/db/index.ts"
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
});
