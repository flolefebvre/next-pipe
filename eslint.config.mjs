// @ts-check

import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Build output and deps are never linted.
  globalIgnores(["dist", "node_modules", "coverage"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
  },
]);
