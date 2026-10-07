import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AGENT_RULES_BLOCK, runAgentsMd, upsertManagedBlock } from "./agents-md.js";

const ROOT = join(import.meta.dirname, "..", "..");
const B = AGENT_RULES_BLOCK;
const BEGIN = "<!-- BEGIN:next-pipe-agent-rules -->";
const END = "<!-- END:next-pipe-agent-rules -->";

describe("upsertManagedBlock", () => {
  test("no file: the block alone, newline-terminated", () => {
    expect(upsertManagedBlock(null, B)).toBe(B + "\n");
  });

  test("no markers: appends after the existing text and one blank line", () => {
    expect(upsertManagedBlock("# Project\n\nRules.\n", B)).toBe(`# Project\n\nRules.\n\n${B}\n`);
    expect(upsertManagedBlock("# Project\n\nRules.", B)).toBe(`# Project\n\nRules.\n\n${B}\n`);
  });

  test("empty file: the block alone", () => {
    expect(upsertManagedBlock("", B)).toBe(B + "\n");
  });

  test("stale block: replaced in place, surrounding text untouched, idempotent", () => {
    const before = "# Project\n\nAbove.\n\n";
    const after = "\n\n## Below\n\nKept.\n";
    const existing = `${before}${BEGIN}\n\nold wording\n\n${END}${after}`;
    const once = upsertManagedBlock(existing, B);
    expect(once).toBe(`${before}${B}${after}`);
    expect(upsertManagedBlock(once, B)).toBe(once);
  });

  test("BEGIN without END throws", () => {
    expect(() => upsertManagedBlock(`text\n${BEGIN}\nstuff\n`, B)).toThrow(/unmatched/);
  });

  test("END without BEGIN throws", () => {
    expect(() => upsertManagedBlock(`text\n${END}\nstuff\n`, B)).toThrow(/unmatched/);
  });
});

describe("runAgentsMd", () => {
  afterEach(() => vi.restoreAllMocks());

  const scratch = () => mkdtempSync(join(tmpdir(), "next-pipe-agents-md-"));
  const quiet = () => vi.spyOn(console, "log").mockImplementation(() => {});

  test("creates AGENTS.md, then leaves it byte-identical", () => {
    quiet();
    const dir = scratch();
    const path = join(dir, "AGENTS.md");
    expect(runAgentsMd([], dir)).toBe(0);
    const first = readFileSync(path, "utf8");
    expect(first).toBe(B + "\n");
    expect(runAgentsMd([], dir)).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(first);
  });

  test("restores a hand-edited block and keeps text outside the markers", () => {
    quiet();
    const dir = scratch();
    const path = join(dir, "AGENTS.md");
    writeFileSync(path, `# Mine\n\n${BEGIN}\nedited\n${END}\n\nAfter.\n`);
    expect(runAgentsMd([], dir)).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(`# Mine\n\n${B}\n\nAfter.\n`);
  });

  test("unmatched marker: exit 1, file untouched", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dir = scratch();
    const path = join(dir, "AGENTS.md");
    writeFileSync(path, `${BEGIN}\n`);
    expect(runAgentsMd([], dir)).toBe(1);
    expect(readFileSync(path, "utf8")).toBe(`${BEGIN}\n`);
  });

  test("--print writes the block to stdout and creates no file", () => {
    const log = quiet();
    const dir = scratch();
    expect(runAgentsMd(["--print"], dir)).toBe(0);
    expect(log).toHaveBeenCalledWith(B);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  });
});

// The README shows the block for users who paste it by hand; it must not drift.
test("README.md contains the block verbatim", () => {
  expect(readFileSync(join(ROOT, "README.md"), "utf8")).toContain(B);
});

// The block's path is load-bearing: renaming the entry page must fail here.
test("the page the block points at exists", () => {
  const page = /node_modules\/@flefebvre\/next-pipe\/([^\s`]+)/.exec(B)?.[1];
  expect(page).toBeDefined();
  expect(existsSync(join(ROOT, page!))).toBe(true);
});
