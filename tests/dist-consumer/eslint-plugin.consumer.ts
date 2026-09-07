/**
 * The ESLint plugin, resolved through the built `dist`.
 *
 * The point of this file is the *shape* of the emitted declarations: the plugin
 * types must be concrete (an `any` here would mean the whole surface degraded)
 * and, crucially, they must not pull `eslint` in — `eslint` is an optional peer
 * dependency, so a `.d.ts` importing from it would break every consumer who
 * only ever runs `tsc`.
 */

import type { IsAny, IsEqual } from "type-fest";
import type { ESLint, Linter } from "eslint";
import type { Expect, Not } from "../helpers.js";
import nextPipe from "@flefebvre/next-pipe/eslint-plugin";

type PluginIsNotAny = Expect<Not<IsAny<typeof nextPipe>>>;

// The one rule, under its unnamespaced key.
type RuleKeys = Expect<IsEqual<keyof (typeof nextPipe)["rules"], "use-pipe-file">>;
type RuleIsNotAny = Expect<Not<IsAny<(typeof nextPipe)["rules"]["use-pipe-file"]>>>;
type RuleHasMessages = Expect<
  IsEqual<(typeof nextPipe)["rules"]["use-pipe-file"]["meta"]["messages"], Record<string, string>>
>;

// `configs.recommended` is a flat config array, spreadable into eslint.config.mjs.
type RecommendedIsAnArray = Expect<
  IsEqual<(typeof nextPipe)["configs"]["recommended"] extends unknown[] ? true : false, true>
>;
type MetaIsStamped = Expect<IsEqual<(typeof nextPipe)["meta"], { name: string; version: string }>>;

/**
 * The plugin must stay *structurally* assignable to ESLint's own types even
 * though its declarations import nothing from `eslint`: that is what lets a
 * `// @ts-check`ed `eslint.config.mjs` spread `configs.recommended` without a
 * cast. `eslint` is imported here, in the fixture — never in `dist`.
 */
const asEslintPlugin: ESLint.Plugin = nextPipe;
const asFlatConfig: Linter.Config[] = nextPipe.configs.recommended;

export { asEslintPlugin, asFlatConfig };
