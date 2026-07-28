/**
 * Route builders, the response middleware, and the pending hook, resolved
 * through the built `dist`.
 *
 * Deliberately schema-free: the zod-derived surfaces are covered by
 * `actions.consumer.ts` and `routes.consumer.ts`, so a failure here points at
 * the transport and hook types rather than at the known zod emit bugs.
 */

import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import type { NextResponse } from "next/server.js";
import { json } from "@flefebvre/next-pipe/server";
import type { JsonValue } from "@flefebvre/next-pipe/server";
import { routePipe } from "@flefebvre/next-pipe/pipes";
import { defineRoute, useApiCall } from "@flefebvre/next-pipe/client";
import type { ParamsOf, BodyOf, ResponseOf, RouteDefinition } from "@flefebvre/next-pipe/client";

/* --- route builders, the response middleware, and the pending hook --- */

const GET = routePipe<{ params: Promise<{ id: string }> }>().handle(async (arg) =>
  json(200, { id: (await arg.ctx.params).id }),
);

type RouteReturnIsNotAny = Expect<Not<IsAny<Awaited<ReturnType<typeof GET>>>>>;
declare const routeReturn: Awaited<ReturnType<typeof GET>>;
const responseMiddlewareApplied: NextResponse<JsonValue> = routeReturn;

const getThing = defineRoute<typeof GET, { id: string }>((p) => `/api/things/${p.id}`, "GET");

type ParamsOfIsTyped = Expect<IsEqual<ParamsOf<typeof getThing>, { id: string }>>;
type BodyOfIsTyped = Expect<IsEqual<BodyOf<typeof getThing>, undefined>>;
type ResponseOfIsTyped = Expect<
  IsEqual<ResponseOf<typeof getThing>, { status: 200; json: { id: string } }>
>;
type RouteDefinitionIsTyped = Expect<
  IsEqual<
    ReturnType<typeof getThing>,
    RouteDefinition<string, undefined, { status: 200; json: { id: string } }, undefined>
  >
>;

const [dispatch, pending] = useApiCall(getThing);
type DispatchArgIsNotAny = Expect<Not<IsAny<Parameters<typeof dispatch>[0]>>>;
type DispatchParamsAreTyped = Expect<
  IsEqual<Parameters<typeof dispatch>[0]["params"], { id: string }>
>;
type DispatchReturnIsTyped = Expect<IsEqual<ReturnType<typeof dispatch>, void>>;
type PendingIsTyped = Expect<IsEqual<typeof pending, boolean>>;

export { GET, getThing, responseMiddlewareApplied, dispatch, pending };
