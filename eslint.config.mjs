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
      // `import z from "zod"` binds the same namespace object as
      // `import * as z`, so it type-checks and runs identically — but
      // declaration emit names types through it one namespace hop too many
      // and writes `z.z.core.…`, which resolves nowhere. Consumers with
      // `skipLibCheck: true` (the Next.js default) then silently get `any`.
      // Caught in the gate by `typecheck:dist`; caught here before that.
      //
      // `no-restricted-imports` cannot express this: given a restricted
      // `importNames`, it also rejects `import * as`, which is the form we
      // want. The selector matches the default specifier and nothing else.
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
