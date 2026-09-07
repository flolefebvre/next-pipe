/**
 * The next-pipe ESLint plugin — flat config only.
 *
 * ```js
 * // eslint.config.mjs
 * import nextPipe from "@flefebvre/next-pipe/eslint-plugin";
 *
 * export default [...nextPipe.configs.recommended];
 * ```
 *
 * See `docs/eslint-plugin.md` for the `pipe.ts` convention the single rule
 * enforces.
 */

import type { Plugin } from "./eslint-types.js";
import { usePipeFile } from "./use-pipe-file.js";

/**
 * Kept in step with `package.json` by hand — reading the manifest at runtime
 * would mean filesystem access on import, for a string ESLint only prints.
 * `index.test.ts` fails the build if the two ever drift.
 */
const VERSION = "1.1.0";

const plugin: Plugin = {
  meta: { name: "@flefebvre/next-pipe/eslint-plugin", version: VERSION },
  rules: { "use-pipe-file": usePipeFile },
  // Filled in below: the config has to reference the plugin that owns it.
  configs: { recommended: [] },
};

plugin.configs.recommended = [
  {
    name: "next-pipe/recommended",
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "next-pipe": plugin },
    rules: { "next-pipe/use-pipe-file": "error" },
  },
];

export default plugin;
