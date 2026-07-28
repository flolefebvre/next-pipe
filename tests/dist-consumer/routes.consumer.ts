/**
 * Route handlers, a hand-written middleware, and the client transport,
 * resolved through the built `dist`.
 */

import z from "zod";
import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import { routePipe } from "@flefebvre/next-pipe/pipes";
import { json, next } from "@flefebvre/next-pipe/server";
import { BeforeMiddleware } from "@flefebvre/next-pipe/middlewares";
import {
  BodyValidationMiddleware,
  QuerystringMiddleware,
} from "@flefebvre/next-pipe/middlewares/routes";
import { callRoute, defineRoute } from "@flefebvre/next-pipe/client";

const schema = z.object({ name: z.string() });

// Authoring a middleware from the published base class is part of the public
// surface: the field it merges must reach the handler's input type.
class TenantMiddleware extends BeforeMiddleware {
  async before() {
    return next({ tenant: "acme" });
  }
}

const GET = routePipe<{ params: Promise<{ id: string }> }>()
  .use(TenantMiddleware)
  .use(QuerystringMiddleware, z.object({ page: z.coerce.number() }))
  .handle(async (arg) => {
    type RouteInputIsNotAny = Expect<Not<IsAny<(typeof arg)["query"]>>>;
    type RouteInputIsTyped = Expect<
      IsEqual<
        typeof arg,
        {
          req: Request;
          ctx: { params: Promise<{ id: string }> };
          tenant: string;
          query: { page: number };
        }
      >
    >;
    return json(200, { id: (await arg.ctx.params).id, tenant: arg.tenant });
  });

const POST = routePipe()
  .use(BodyValidationMiddleware, schema)
  .handle(async (arg) => {
    type BodyIsNotAny = Expect<Not<IsAny<(typeof arg)["input"]>>>;
    type BodyIsTyped = Expect<IsEqual<(typeof arg)["input"], { name: string }>>;
    return json(201, { created: arg.input.name });
  });

const getThing = defineRoute<typeof GET, { id: string }>((p) => `/api/things/${p.id}`, "GET");
const createThing = defineRoute<typeof POST>(() => "/api/things", "POST");

async function callRoutes() {
  const read = await callRoute(getThing({ id: "1" }), { query: { page: 1 } });
  type ReadResponseIsTyped = Expect<
    IsEqual<
      typeof read,
      | { status: 200; json: { id: string; tenant: string } }
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

  const written = await callRoute(createThing(), { json: { name: "a" } });
  type WrittenResponseIsTyped = Expect<
    IsEqual<
      typeof written,
      | { status: 201; json: { created: string } }
      | {
          readonly status: 400;
          readonly json: {
            status: "error";
            error: {
              type: "schema";
              data: { formErrors: string[]; fieldErrors: { name?: string[] | undefined } };
            };
          };
        }
    >
  >;
}

export { GET, POST, getThing, createThing, callRoutes };
