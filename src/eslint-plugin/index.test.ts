import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import plugin from "./index.js";

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8"),
) as { version: string };

// `meta.version` is a hand-kept copy of the package version (reading the
// manifest at import time would mean filesystem access for a string ESLint only
// prints). This is what stops the two from drifting.
test("the plugin's meta.version matches the package version", () => {
  expect(plugin.meta.version).toBe(manifest.version);
});

test("the recommended config enables the rule under the next-pipe namespace", () => {
  expect(Object.keys(plugin.rules)).toEqual(["use-pipe-file"]);
  expect(plugin.configs.recommended).toHaveLength(1);

  const [config] = plugin.configs.recommended;
  expect(config?.files).toEqual(["**/*.ts", "**/*.tsx"]);
  expect(config?.plugins?.["next-pipe"]).toBe(plugin);
  expect(config?.rules).toEqual({ "next-pipe/use-pipe-file": "error" });
});
