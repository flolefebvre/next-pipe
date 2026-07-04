import { afterEach, expect, test, vi } from "vitest";
import { callRoute, defineRoute, type RouteDefinition } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

test("defineRoute builds a {url, method} from its params", () => {
  const builder = defineRoute<never, { id: string }>(
    ({ id }) => `http://localhost/api/posts/${id}`,
    "get",
  );

  expect(builder({ id: "42" })).toStrictEqual({
    url: "http://localhost/api/posts/42",
    method: "get",
  });
});

test("callRoute returns the route's {status, json} on success", async () => {
  stubFetch(200, { liked: true });
  const builder = defineRoute<never>(() => "http://localhost/api/like", "post");

  const result = await callRoute(builder());
  expect(result).toStrictEqual({ status: 200, json: { liked: true } });
});

test("callRoute surfaces declared error statuses instead of throwing", async () => {
  stubFetch(403, { reason: "nope" });
  const builder = defineRoute<never>(() => "http://localhost/api/like", "post");

  const result = await callRoute(builder());
  expect(result).toStrictEqual({ status: 403, json: { reason: "nope" } });
});

function stubFetchCapture() {
  const sent: { url?: string; method?: string; body?: unknown } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.url = url;
      sent.method = init.method as string;
      sent.body = init.body === undefined ? undefined : JSON.parse(init.body as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
  return sent;
}

test("callRoute forwards a json body when one is provided", async () => {
  const sent = stubFetchCapture();
  const definition = { url: "http://localhost/api/like", method: "post" } as RouteDefinition<
    "post",
    { like: boolean },
    { status: number; json: unknown }
  >;

  await callRoute(definition, { json: { like: true } });

  expect(sent.url).toBe("http://localhost/api/like");
  expect(sent.method).toBe("post");
  expect(sent.body).toStrictEqual({ like: true });
});

test("callRoute appends a declared query as searchParams", async () => {
  const sent = stubFetchCapture();
  const definition = { url: "http://localhost/api/posts", method: "get" } as RouteDefinition<
    "get",
    undefined,
    { status: number; json: unknown },
    { page: number; tag?: string }
  >;

  await callRoute(definition, { query: { page: 2, tag: "next" } });
  expect(sent.url).toBe("http://localhost/api/posts?page=2&tag=next");

  await callRoute(definition, { query: { page: 1 } });
  expect(sent.url).toBe("http://localhost/api/posts?page=1");
});
