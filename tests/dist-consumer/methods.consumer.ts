/**
 * Every HTTP method a Next.js App Router `route.ts` may export, resolved
 * through the built `dist`.
 *
 * The seven are Next's `HTTP_METHODS` (`next/dist/server/web/http`), mirrored
 * by `VERBS` in the codegen. Next answers HEAD from GET when HEAD is not
 * exported, auto-implements OPTIONS with an `Allow` header, and 405s a method
 * with no export — all above the pipe. What is asserted here is that the
 * *published* types let a consumer export a `routePipe()` handler under each
 * name, build a `defineRoute` builder for it, and get the route's own response
 * union back from `callRoute`.
 */

import z from "zod";
import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import { routePipe } from "@flefebvre/next-pipe/pipes";
import { json } from "@flefebvre/next-pipe/server";
import {
  BodyValidationMiddleware,
  QuerystringMiddleware,
} from "@flefebvre/next-pipe/middlewares/routes";
import { callRoute, defineRoute } from "@flefebvre/next-pipe/client";

const body = z.object({ name: z.string() });

/**
 * The shape a `route.ts` export must have, mirroring Next's
 * `AppRouteHandlerFn` (`next/dist/server/route-modules/app-route/module`).
 * Written out rather than imported: it sits behind a deep internal path, not a
 * public entrypoint.
 */
type NextRouteHandlerFn<TParams = Record<string, string | string[] | undefined>> = (
  request: Request,
  context: { params: Promise<TParams> },
) => Promise<Response>;

const GET = routePipe()
  .use(QuerystringMiddleware, z.object({ page: z.coerce.number() }))
  .handle(async (arg) => {
    type QueryIsNotAny = Expect<Not<IsAny<(typeof arg)["query"]>>>;
    return json(200, { page: arg.query.page });
  });

// The payload is derived from the request rather than written as a literal:
// `json`'s `TJson` is constrained to `JsonValue`, so a literal `true` would be
// inferred as `true` rather than `boolean` and the assertion below would be
// about inference, not about the method.
const HEAD = routePipe().handle(async (arg) => json(200, { url: arg.req.url }));

const POST = routePipe()
  .use(BodyValidationMiddleware, body)
  .handle(async (arg) => json(201, { created: arg.input.name }));

const PUT = routePipe()
  .use(BodyValidationMiddleware, body)
  .handle(async (arg) => json(200, { replaced: arg.input.name }));

const PATCH = routePipe()
  .use(BodyValidationMiddleware, body)
  .handle(async (arg) => json(200, { patched: arg.input.name }));

const DELETE = routePipe<{ params: Promise<{ id: string }> }>().handle(async (arg) => {
  type ParamsAreNotAny = Expect<Not<IsAny<(typeof arg)["ctx"]["params"]>>>;
  return json(200, { deleted: (await arg.ctx.params).id });
});

const OPTIONS = routePipe().handle(async () => json(200, { allow: "GET,POST" }));

// Each of the seven is a valid Next route export, straight off the published
// handler type.
const routeModule = {
  GET,
  HEAD,
  POST,
  PUT,
  DELETE,
  PATCH,
  OPTIONS,
} satisfies {
  GET: NextRouteHandlerFn;
  HEAD: NextRouteHandlerFn;
  POST: NextRouteHandlerFn;
  PUT: NextRouteHandlerFn;
  // A route with a dynamic segment declares its own params, exactly as Next's
  // generated `RouteContext<"/api/things/[id]">` does.
  DELETE: NextRouteHandlerFn<{ id: string }>;
  PATCH: NextRouteHandlerFn;
  OPTIONS: NextRouteHandlerFn;
};

type EveryMethodIsExportable = Expect<
  IsEqual<
    keyof typeof routeModule,
    "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS"
  >
>;

// `defineRoute` takes the method as its third type argument; TypeScript has no
// partial type-argument inference, so it is spelled out to keep the literal.
const readThings = defineRoute<typeof GET, void, "GET">(() => "/api/things", "GET");
const peekThings = defineRoute<typeof HEAD, void, "HEAD">(() => "/api/things", "HEAD");
const createThing = defineRoute<typeof POST, void, "POST">(() => "/api/things", "POST");
const replaceThing = defineRoute<typeof PUT, void, "PUT">(() => "/api/things", "PUT");
const patchThing = defineRoute<typeof PATCH, void, "PATCH">(() => "/api/things", "PATCH");
const deleteThing = defineRoute<typeof DELETE, { id: string }, "DELETE">(
  (p) => `/api/things/${p.id}`,
  "DELETE",
);
const thingOptions = defineRoute<typeof OPTIONS, void, "OPTIONS">(() => "/api/things", "OPTIONS");

type MethodsAreCarried = Expect<
  IsEqual<
    {
      GET: ReturnType<typeof readThings>["method"];
      HEAD: ReturnType<typeof peekThings>["method"];
      POST: ReturnType<typeof createThing>["method"];
      PUT: ReturnType<typeof replaceThing>["method"];
      DELETE: ReturnType<typeof deleteThing>["method"];
      PATCH: ReturnType<typeof patchThing>["method"];
      OPTIONS: ReturnType<typeof thingOptions>["method"];
    },
    {
      GET: "GET";
      HEAD: "HEAD";
      POST: "POST";
      PUT: "PUT";
      DELETE: "DELETE";
      PATCH: "PATCH";
      OPTIONS: "OPTIONS";
    }
  >
>;

/** The 400 branch a body-validating route contributes to its response union. */
type BodyError = {
  readonly status: 400;
  readonly json: {
    status: "error";
    error: {
      type: "schema";
      data: { formErrors: string[]; fieldErrors: { name?: string[] | undefined } };
    };
  };
};

async function callEveryMethod() {
  const read = await callRoute(readThings(), { query: { page: 1 } });
  type ReadIsTyped = Expect<
    IsEqual<
      typeof read,
      | { status: 200; json: { page: number } }
      | {
          readonly status: 400;
          readonly json: {
            status: "error";
            error: {
              type: "querystring";
              data: { formErrors: string[]; fieldErrors: { page?: string[] | undefined } };
            };
          };
        }
    >
  >;

  const peeked = await callRoute(peekThings());
  type PeekIsTyped = Expect<IsEqual<typeof peeked, { status: 200; json: { url: string } }>>;

  const created = await callRoute(createThing(), { json: { name: "a" } });
  type CreateIsTyped = Expect<
    IsEqual<typeof created, { status: 201; json: { created: string } } | BodyError>
  >;

  const replaced = await callRoute(replaceThing(), { json: { name: "a" } });
  type ReplaceIsTyped = Expect<
    IsEqual<typeof replaced, { status: 200; json: { replaced: string } } | BodyError>
  >;

  const patched = await callRoute(patchThing(), { json: { name: "a" } });
  type PatchIsTyped = Expect<
    IsEqual<typeof patched, { status: 200; json: { patched: string } } | BodyError>
  >;

  const deleted = await callRoute(deleteThing({ id: "1" }));
  type DeleteIsTyped = Expect<IsEqual<typeof deleted, { status: 200; json: { deleted: string } }>>;

  const options = await callRoute(thingOptions());
  type OptionsIsTyped = Expect<IsEqual<typeof options, { status: 200; json: { allow: string } }>>;
}

export { GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS, callEveryMethod };
