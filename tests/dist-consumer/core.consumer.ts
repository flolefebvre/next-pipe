/**
 * The core builder primitives, helpers, and authoring types, resolved through
 * the built `dist`.
 *
 * Every expectation below is the shape the same code produces when compiled
 * against `src` — verified there before being written here — so a failure
 * means declaration emit lost type information on the way out.
 */

import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import {
  Pipe,
  entry,
  createPipe,
  next,
  interrupt,
  success,
  error,
  merge,
  json,
} from "@flefebvre/next-pipe/server";
import type {
  ActionSuccess,
  ActionError,
  ActionResult,
  JsonPrimitive,
  JsonArray,
  JsonObject,
  JsonValue,
} from "@flefebvre/next-pipe/server";
import { BeforeMiddleware, Middleware } from "@flefebvre/next-pipe/middlewares";
import type { Apply, MiddlewareConfig } from "@flefebvre/next-pipe/middlewares";

/* --- value helpers --- */

const merged = merge({ a: 1, b: "x" }, { b: 2, c: true });
type MergeIsNotAny = Expect<Not<IsAny<typeof merged>>>;
type MergeIsTyped = Expect<IsEqual<typeof merged, { a: number; b: number; c: boolean }>>;

const jsonValue = json(200, { ok: true });
type JsonHelperIsTyped = Expect<IsEqual<typeof jsonValue, { status: 200; json: { ok: true } }>>;

type SuccessIsTyped = Expect<
  IsEqual<ReturnType<typeof success<number>>, { status: "success"; data: number }>
>;
type EmptySuccessIsTyped = Expect<
  IsEqual<ReturnType<typeof success>, { status: "success"; data: unknown }>
>;
type ErrorIsTyped = Expect<
  IsEqual<
    ReturnType<typeof error<"forbidden", { reason: string }>>,
    { status: "error"; error: { type: "forbidden"; data: { reason: string } } }
  >
>;

/* --- authoring a pipe from the primitives --- */

class TenantMiddleware extends BeforeMiddleware {
  async before(arg: { id: string }) {
    if (arg.id === "") return interrupt(error("no-tenant", { id: arg.id }));
    return next({ tenant: "acme" as const });
  }
}

const handler = new Pipe(entry((id: string) => ({ id })))
  .use(TenantMiddleware)
  .handle(async (arg) => {
    type PipeInputIsNotAny = Expect<Not<IsAny<typeof arg>>>;
    type PipeInputIsTyped = Expect<IsEqual<typeof arg, { id: string; tenant: "acme" }>>;
    return success(arg.tenant);
  });

type HandlerIsTyped = Expect<
  IsEqual<
    typeof handler,
    (
      id: string,
    ) => Promise<
      | { status: "error"; error: { type: "no-tenant"; data: { id: string } } }
      | { status: "success"; data: "acme" }
    >
  >
>;

const empty = createPipe().handle(async (arg) => {
  type EmptyPipeInputIsTyped = Expect<IsEqual<typeof arg, {}>>;
  return success(1);
});
type EmptyPipeIsTyped = Expect<
  IsEqual<typeof empty, () => Promise<{ status: "success"; data: number }>>
>;

/* --- authoring types --- */

type ApplyIsTyped = Expect<IsEqual<Awaited<Apply<TenantMiddleware, "out">>, "out">>;
type MiddlewareConfigIsTyped = Expect<
  IsEqual<MiddlewareConfig<"output", { a: 1 }>, { output: { a: 1 } }>
>;
type MiddlewareIsNotAny = Expect<Not<IsAny<Middleware>>>;

/* --- action result types --- */

type ActionSuccessIsTyped = Expect<
  IsEqual<ActionSuccess<number>, { status: "success"; data: number }>
>;
type ActionErrorIsTyped = Expect<
  IsEqual<ActionError<"nope", boolean>, { status: "error"; error: { type: "nope"; data: boolean } }>
>;
type ActionResultIsTyped = Expect<
  IsEqual<
    ActionResult<number, "nope", boolean>,
    ActionSuccess<number> | ActionError<"nope", boolean>
  >
>;

/* --- json types --- */

type JsonPrimitiveIsTyped = Expect<
  IsEqual<JsonPrimitive, string | number | boolean | null | undefined>
>;
type JsonArrayIsTyped = Expect<IsEqual<JsonArray, JsonValue[] | readonly JsonValue[]>>;
type JsonObjectIsTyped = Expect<IsEqual<JsonObject, { [key: string]: JsonValue }>>;

export { handler, empty, merged, jsonValue };
