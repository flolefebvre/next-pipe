import { afterEach, expect, test, vi } from "vitest";
import { callRoute, defineRoute, type RouteDefinition } from "./client.js";
import type { Expect } from "../tests/helpers.js";
import type { IsEqual } from "type-fest";

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

/**
 * The seven methods a Next.js `route.ts` may export. The transport is method
 * agnostic — `callRoute` forwards `definition.method` to `fetch` verbatim and
 * never normalizes it — so each one is pinned here.
 */
const METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"] as const;
type Method = (typeof METHODS)[number];

/** Methods whose request may carry a body (`fetch` rejects one on GET/HEAD). */
const BODY_METHODS = ["POST", "PUT", "DELETE", "PATCH"] as const;

test.each(METHODS)("defineRoute builds a %s definition", (method) => {
  const builder = defineRoute<never, { id: string }, Method>(
    ({ id }) => `http://localhost/api/things/${id}`,
    method,
  );

  expect(builder({ id: "42" })).toStrictEqual({
    url: "http://localhost/api/things/42",
    method,
  });
});

test.each(METHODS)("callRoute sends the %s method to fetch", async (method) => {
  const sent = stubFetchCapture();
  const definition = { url: "http://localhost/api/things", method } as RouteDefinition<
    Method,
    undefined,
    { status: number; json: unknown }
  >;

  await callRoute(definition);

  expect(sent.method).toBe(method);
  expect(sent.url).toBe("http://localhost/api/things");
  expect(sent.body).toBeUndefined();
});

test.each(METHODS)("callRoute appends a declared query on a %s route", async (method) => {
  const sent = stubFetchCapture();
  const definition = { url: "http://localhost/api/things", method } as RouteDefinition<
    Method,
    undefined,
    { status: number; json: unknown },
    { page: number }
  >;

  await callRoute(definition, { query: { page: 3 } });

  expect(sent.method).toBe(method);
  expect(sent.url).toBe("http://localhost/api/things?page=3");
});

test.each(BODY_METHODS)("callRoute forwards a json body on a %s route", async (method) => {
  const sent = stubFetchCapture();
  const definition = { url: "http://localhost/api/things", method } as RouteDefinition<
    Method,
    { name: string },
    { status: number; json: unknown }
  >;

  await callRoute(definition, { json: { name: "acme" } });

  expect(sent.method).toBe(method);
  expect(sent.body).toStrictEqual({ name: "acme" });
});

test("the method never narrows the result type", async () => {
  stubFetch(200, { ok: true });

  // `defineRoute`'s `TMethod` is the third type parameter: TypeScript has no
  // partial type-argument inference, so supplying `H`/`Params` alone leaves it
  // at its `string` default. Given all three, the literal is carried through.
  type MethodOf<M extends string> = ReturnType<
    ReturnType<typeof defineRoute<never, void, M>>
  >["method"];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type EveryMethodKeepsItsLiteral = Expect<
    IsEqual<{ [M in Method]: MethodOf<M> }, { [M in Method]: M }>
  >;

  const definition = {
    url: "http://localhost/api/things",
    method: "PATCH",
  } as RouteDefinition<Method, undefined, { status: 200; json: { ok: boolean } }>;

  const result = await callRoute(definition);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type ResultIsTheRouteResponse = Expect<
    IsEqual<typeof result, { status: 200; json: { ok: boolean } }>
  >;

  expect(result).toStrictEqual({ status: 200, json: { ok: true } });
});
