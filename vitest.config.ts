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
    restoreMocks: true
  }
});
