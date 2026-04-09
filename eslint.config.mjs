import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

// eslint-config-next is not included here because eslint-plugin-react (a transitive
// dependency) uses contextOrFilename.getFilename() which was removed in ESLint 10.
// Re-add eslint-config-next once Next.js updates their ESLint plugin for ESLint 10+.

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error"
    }
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/**",
      "*.config.mjs", // ESLint config (self-referential)
      "next.config.*", // Next.js config (framework-generated patterns)
      "coverage/**",
      "notes-local/**",
      // vitest.config.ts is intentionally linted via tsc
    ]
  }
);
