import ts from "typescript";
import { expect, test } from "vitest";
import { VERBS } from "./analyze-routes.js";
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
  expect(out).toContain("GET: () => _r0.GET({ id })");
  expect(out).toContain("POST: () => _r0.POST({ id })");
});

test("static-only route: verb called with no params", () => {
  const out = buildBarrel([{ relDir: "tests/route", verbs: ["GET"], params: [] }]);

  expect(out).toContain("GET: () => _r0.GET()");
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
  expect(out).toContain("GET: () => _r0.GET({ slug })");
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
  expect(out).toContain("GET: () => _r0.GET({ slug })");
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
  expect(out).toMatch(/GET: \(\) => _r\d\.GET\(\{ id \}\)/); // [id] leaf
  expect(out).toMatch(/GET: \(\) => _r\d\.GET\(\)/); // posts leaf
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
  expect(out).toContain("GET: () => _r0.GET({ org, repo })");
});

test.each(VERBS)("a barrel holding a %s route is syntactically valid TypeScript", (verb) => {
  const out = buildBarrel([{ relDir: "api/thing", verbs: [verb], params: [] }]);

  const { diagnostics = [] } = ts.transpileModule(out, {
    fileName: "index.ts",
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });

  expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))).toEqual([]);
});

test("a static segment named `get` does not collide with the parent's GET verb", () => {
  const out = buildBarrel([
    { relDir: "api", verbs: ["GET"], params: [] },
    { relDir: "api/get", verbs: ["GET"], params: [] },
  ]);

  // `get` is the child node, `GET` the verb builder: two distinct keys.
  expect(out).toContain("get: {");
  expect(out).toMatch(/GET: \(\) => _r\d\.GET\(\)/);
});

test("root route imports the `_root` module, never the barrel itself", () => {
  // `app/route.ts` has an empty relDir; a bare `"./"` import would resolve to
  // `index.ts` — the barrel — and every root builder would be `undefined`.
  const out = buildBarrel([
    { relDir: "", verbs: ["GET"], params: [] },
    { relDir: "api/health", verbs: ["GET"], params: [] },
  ]);

  expect(out).toContain(`import * as _r0 from "./_root";`);
  expect(out).not.toContain(`from "./";`);
  expect(out).toContain("GET: () => _r0.GET()");
  expect(out).toContain(`import * as _r1 from "./api/health";`);
});
