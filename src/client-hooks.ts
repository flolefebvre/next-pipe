"use client";

import { useTransition } from "react";
import {
  callRoute,
  type BodyOf,
  type ParamsOf,
  type QueryOf,
  type ResponseOf,
  type RouteBuilder,
} from "./client.js";

/**
 * Generic pending-state hook wrapping any generated route builder.
 *
 * Pass a builder; its parameter list and route config drive `dispatch`'s argument:
 * - `params` is required only when the builder takes one (`(p) => …` vs `() => …`),
 * - `json` only when the route declares a body,
 * - `query` only when it declares a querystring.
 *
 * Each key is dropped entirely otherwise — `dispatch()` is legal when nothing is
 * required. `onSuccess` receives the pure `output` union. Errors are not handled
 * yet: if `callRoute` throws (network failure, bad shape) it propagates.
 */
export function useApiCall<B extends RouteBuilder>(
  builder: B,
  options?: { onSuccess?: (res: ResponseOf<B>) => void },
) {
  // Each part contributes a required key only when the route/builder declares it;
  // otherwise it is `object`, so an unknown key on the dispatch literal is rejected.
  type ParamsPart = [] extends Parameters<B> ? object : { params: ParamsOf<B> };
  type BodyPart = [BodyOf<B>] extends [undefined] ? object : { json: BodyOf<B> };
  type QueryPart = [QueryOf<B>] extends [undefined] ? object : { query: QueryOf<B> };
  type Arg = ParamsPart & BodyPart & QueryPart;
  // When no part is required, take no args at all (reject a stray object);
  // otherwise the single arg is required.
  type DispatchArgs = object extends Arg ? [] : [arg: Arg];

  const [isPending, startTransition] = useTransition();

  const dispatch = (...args: DispatchArgs) => {
    const arg = (args[0] ?? {}) as { params?: unknown; json?: unknown; query?: unknown };
    startTransition(async () => {
      // Builder ignores the extra arg when it takes none; supplies it otherwise.
      const definition = (builder as unknown as (params: unknown) => ReturnType<B>)(arg.params);
      const res = await callRoute(definition, { json: arg.json, query: arg.query });
      startTransition(() => options?.onSuccess?.(res as ResponseOf<B>));
    });
  };

  return [dispatch, isPending] as const;
}
