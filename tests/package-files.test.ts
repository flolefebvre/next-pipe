import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// The README is a table of contents for `docs/` and `skills/`. Those pages
// have to ship in the tarball, next to the README, at the installed version:
// an agent reading `node_modules/@flefebvre/next-pipe/` otherwise finds every
// link dead (#25). This resolves the real packlist, so a `files` edit that
// drops a linked page fails here rather than after publish.

const readme = readFileSync("README.md", "utf8");
const relativeLinks = [...readme.matchAll(/\]\((?!https?:|#)\.?\/?([^)#]+)(?:#[^)]*)?\)/g)].map(
  (m) => m[1]!,
);

const packed = (
  JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" }),
  ) as {
    files: { path: string }[];
  }[]
)[0]!.files.map((f) => f.path);

test("README links something", () => {
  expect(relativeLinks.length).toBeGreaterThan(10);
});

test("every relative README link is in the published tarball", () => {
  const missing = [...new Set(relativeLinks)].filter((link) => !packed.includes(link));
  expect(missing).toEqual([]);
});

test("repo-internal agent docs are not published", () => {
  expect(packed.filter((p) => p.startsWith("docs/agents/"))).toEqual([]);
});
