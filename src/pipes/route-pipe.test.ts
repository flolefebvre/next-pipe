import { routePipe } from "./route-pipe.js";
import { json } from "../helpers.js";
import { BodyValidationMiddleware } from "../middlewares/routes/body-validation-middleware.js";
import { QuerystringMiddleware } from "../middlewares/routes/querystring-middleware.js";
import type { Expect } from "../../tests/helpers.js";
import type { IsEqual } from "type-fest";
import { expect, test } from "vitest";
import * as z from "zod";

/**
 * The seven methods a Next.js App Router `route.ts` may export — `HTTP_METHODS`
 * in `next/dist/server/web/http`, mirrored by `VERBS` in the codegen.
 *
 * What Next does *around* them is its own routing layer, above the pipe: HEAD
 * is answered from GET when HEAD is not exported, OPTIONS is auto-implemented
 * with an `Allow` header built from the exported methods, and a method with no
 * export answers 405. `routePipe` is method-agnostic — it never reads
 * `req.method` — so what these tests pin is that one and the same pipe works
 * under every one of the seven names, at runtime and at type level.
 */
const METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"] as const;
type Method = (typeof METHODS)[number];

/**
 * Methods whose request may carry a body. `fetch`/undici reject a body on GET
 * and HEAD outright, and a body on OPTIONS is never sent in practice, so the
 * body-reading middlewares are only exercised on these four.
 */
const BODY_METHODS = ["POST", "PUT", "DELETE", "PATCH"] as const;

/**
 * The shape a `route.ts` export must have, mirroring Next's
 * `AppRouteHandlerFn` (`next/dist/server/route-modules/app-route/module`).
 * Declared here rather than imported: it lives behind a deep internal path,
 * not a public entrypoint.
 */
type NextRouteHandlerFn = (
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

const emptyContext = () => ({ params: Promise.resolve({}) });
const request = (method: Method, url = "http://localhost:3000/theroute") =>
  new Request(url, { method });

test("Simple", async () => {
  const pipe = routePipe();
  const handler = pipe.handle(async () => json(200, "hey"));

  const result = await handler(
    new Request("http://localhost:3000/theroute"),
    null as unknown as never,
  );
  expect(result.status).toBe(200);
  await expect(result.json()).resolves.toStrictEqual("hey");
});

test("With Context", async () => {
  const pipe = routePipe<{ params: Promise<{ id: string }> }>();
  const handler = pipe.handle(async ({ ctx }) => json(200, (await ctx.params).id));

  const result = await handler(new Request("http://localhost:3000/theroute"), {
    params: Promise.resolve({ id: "yo" }),
  });
  expect(result.status).toBe(200);
  await expect(result.json()).resolves.toStrictEqual("yo");
});

test("a routePipe handler is exportable under every Next route method", async () => {
  const handler = routePipe().handle(async ({ req }) => json(200, req.method));

  // `satisfies` is the type-level half: each of the seven exports must be a
  // valid Next route handler. The loop below is the runtime half.
  const routeModule = {
    GET: handler,
    HEAD: handler,
    POST: handler,
    PUT: handler,
    DELETE: handler,
    PATCH: handler,
    OPTIONS: handler,
  } satisfies Record<Method, NextRouteHandlerFn>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type EveryMethodIsCovered = Expect<IsEqual<keyof typeof routeModule, Method>>;

  for (const method of METHODS) {
    const result = await routeModule[method](request(method), emptyContext());
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toBe(method);
  }
});

test.each(METHODS)("%s: the route context reaches the handler", async (method) => {
  const handler = routePipe<{ params: Promise<{ id: string }> }>().handle(async ({ req, ctx }) =>
    json(200, { method: req.method, id: (await ctx.params).id }),
  );

  const result = await handler(request(method), { params: Promise.resolve({ id: "7" }) });

  expect(result.status).toBe(200);
  await expect(result.json()).resolves.toStrictEqual({ method, id: "7" });
});

test.each(METHODS)("%s: querystring validation runs whatever the method", async (method) => {
  const handler = routePipe()
    .use(QuerystringMiddleware, z.object({ page: z.coerce.number() }))
    .handle(async ({ req, query }) => json(200, { method: req.method, page: query.page }));

  const ok = await handler(
    request(method, "http://localhost:3000/theroute?page=2"),
    emptyContext(),
  );
  expect(ok.status).toBe(200);
  await expect(ok.json()).resolves.toStrictEqual({ method, page: 2 });

  const invalid = await handler(
    request(method, "http://localhost:3000/theroute?page=nope"),
    emptyContext(),
  );
  expect(invalid.status).toBe(400);
});

test.each(BODY_METHODS)(
  "%s: body validation runs on a request that carries one",
  async (method) => {
    const handler = routePipe()
      .use(BodyValidationMiddleware, z.object({ name: z.string() }))
      .handle(async ({ req, input }) => json(200, { method: req.method, name: input.name }));

    const ok = await handler(
      new Request("http://localhost:3000/theroute", {
        method,
        body: JSON.stringify({ name: "acme" }),
      }),
      emptyContext(),
    );
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toStrictEqual({ method, name: "acme" });

    const invalid = await handler(
      new Request("http://localhost:3000/theroute", {
        method,
        body: JSON.stringify({ name: 42 }),
      }),
      emptyContext(),
    );
    expect(invalid.status).toBe(400);
  },
);
