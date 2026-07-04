import { expect, test } from "vitest";
import { resolveRoutePath } from "./resolve-route-path.js";

const req = (name: string, type: "string" | "string[]" = "string") => ({
  name,
  type,
  optional: false,
});

test("static route", () => {
  expect(resolveRoutePath("tests/route")).toEqual({
    params: [],
    urlTemplate: "/tests/route",
  });
});

test("single dynamic segment becomes a param + placeholder", () => {
  expect(resolveRoutePath("api/posts/[id]/like")).toEqual({
    params: [req("id")],
    urlTemplate: "/api/posts/${id}/like",
  });
});

test("multiple dynamic segments keep order", () => {
  expect(resolveRoutePath("[org]/repos/[repo]")).toEqual({
    params: [req("org"), req("repo")],
    urlTemplate: "/${org}/repos/${repo}",
  });
});

test("route groups are stripped from the URL but keep surrounding params", () => {
  expect(resolveRoutePath("(marketing)/api/posts/[id]")).toEqual({
    params: [req("id")],
    urlTemplate: "/api/posts/${id}",
  });
});

test("root route", () => {
  expect(resolveRoutePath("")).toEqual({ params: [], urlTemplate: "/" });
});

test("catch-all becomes a required string[] joined into the URL", () => {
  expect(resolveRoutePath("docs/[...slug]")).toEqual({
    params: [req("slug", "string[]")],
    urlTemplate: '/docs/${slug.join("/")}',
  });
});

test("optional catch-all is an optional string[] that collapses when empty", () => {
  expect(resolveRoutePath("shop/[[...slug]]")).toEqual({
    params: [{ name: "slug", type: "string[]", optional: true }],
    urlTemplate: '/shop${slug?.length ? `/${slug.join("/")}` : ""}',
  });
});

test("optional catch-all at the root keeps the leading slash when empty", () => {
  expect(resolveRoutePath("[[...slug]]")).toEqual({
    params: [{ name: "slug", type: "string[]", optional: true }],
    urlTemplate: '${slug?.length ? `/${slug.join("/")}` : "/"}',
  });
});

test("a dynamic segment can precede a catch-all", () => {
  expect(resolveRoutePath("[org]/docs/[...path]")).toEqual({
    params: [req("org"), req("path", "string[]")],
    urlTemplate: '/${org}/docs/${path.join("/")}',
  });
});
