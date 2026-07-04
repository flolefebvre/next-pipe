import { expect, test } from "vitest";
import { buildBarrel } from "./build-barrel.js";

const req = (name: string, type: "string" | "string[]" = "string", optional = false) => ({
  name,
  type,
  optional,
});

test("dynamic segment becomes a positional call, verbs are zero-arg builders", () => {
  const out = buildBarrel([
    {
      relDir: "api/posts/[id]/like",
      verbs: ["POST", "GET"],
      params: [req("id")],
    },
  ]);

  expect(out).toContain(`import * as _r0 from "./api/posts/[id]/like";`);
  expect(out).toContain("api: {");
  expect(out).toContain("posts: (id: string) => ({");
  expect(out).toContain("like: {");
  expect(out).toContain("get: () => _r0.get({ id })");
  expect(out).toContain("post: () => _r0.post({ id })");
});

test("static-only route: verb called with no params", () => {
  const out = buildBarrel([{ relDir: "tests/route", verbs: ["GET"], params: [] }]);

  expect(out).toContain("get: () => _r0.get()");
});

test("catch-all segment becomes a positional string[] call", () => {
  const out = buildBarrel([
    {
      relDir: "docs/[...slug]",
      verbs: ["GET"],
      params: [req("slug", "string[]")],
    },
  ]);

  expect(out).toContain("(slug: string[]) => ({");
  expect(out).toContain("get: () => _r0.get({ slug })");
});

test("optional catch-all segment becomes an optional positional string[] call", () => {
  const out = buildBarrel([
    {
      relDir: "shop/[[...slug]]",
      verbs: ["GET"],
      params: [req("slug", "string[]", true)],
    },
  ]);

  expect(out).toContain("(slug?: string[]) => ({");
  expect(out).toContain("get: () => _r0.get({ slug })");
});

test("route groups are stripped from the barrel tree (but kept in the import path)", () => {
  const out = buildBarrel([{ relDir: "(marketing)/api/ping", verbs: ["GET"], params: [] }]);

  // The module physically lives under the grouped dir, so the import keeps it...
  expect(out).toContain(`import * as _r0 from "./(marketing)/api/ping";`);
  // ...but the group is never a navigation node in the tree.
  expect(out).not.toContain("marketing:");
  expect(out).not.toContain('(marketing)":');
  expect(out).toContain("api: {");
  expect(out).toContain("ping: {");
});

test("a node that is both callable and has verbs uses Object.assign", () => {
  const out = buildBarrel([
    { relDir: "api/posts", verbs: ["GET"], params: [] },
    { relDir: "api/posts/[id]", verbs: ["GET"], params: [req("id")] },
  ]);

  // `posts` lists likes itself (GET) and is callable to descend into [id].
  expect(out).toContain("posts: Object.assign((id: string) => ({");
  expect(out).toMatch(/get: \(\) => _r\d\.get\(\{ id \}\)/); // [id] leaf
  expect(out).toMatch(/get: \(\) => _r\d\.get\(\)/); // posts leaf
});

test("a segment that is not a valid identifier is quoted as a string key", () => {
  const out = buildBarrel([{ relDir: "api/.well-known", verbs: ["GET"], params: [] }]);

  expect(out).toContain(`".well-known":`);
});

test("routes sharing a dynamic segment reuse the single dynamic node", () => {
  const out = buildBarrel([
    { relDir: "[org]/repos", verbs: ["GET"], params: [req("org")] },
    { relDir: "[org]/issues", verbs: ["GET"], params: [req("org")] },
  ]);

  // One arrow for the shared `[org]` segment, both static children under it.
  expect(out.match(/\(org: string\) =>/g)?.length).toBe(1);
  expect(out).toContain("repos: {");
  expect(out).toContain("issues: {");
});

test("multiple dynamic segments chain as nested calls", () => {
  const out = buildBarrel([
    {
      relDir: "[org]/repos/[repo]",
      verbs: ["GET"],
      params: [req("org"), req("repo")],
    },
  ]);

  expect(out).toContain("(org: string) => ({");
  expect(out).toContain("(repo: string) => ({");
  expect(out).toContain("get: () => _r0.get({ org, repo })");
});
