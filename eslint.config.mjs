// @ts-check

import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Build output and deps are never linted.
  globalIgnores(["dist", "node_modules", "coverage"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    rules: {
      // Not `no-restricted-imports`: given a restricted `importNames`, it also
      // rejects `import * as`, which is the form we want.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value='zod'] > ImportDefaultSpecifier",
          message:
            'Use `import * as z from "zod"`. A default import makes declaration emit write unresolvable `z.z.core.…` types (see #7).',
        },
      ],
    },
  },
]);
