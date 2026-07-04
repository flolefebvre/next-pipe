import type { __MIDDLEWARE_CONFIG } from "./core.js";

/**
 * Client-side HTTP layer for the generated route builders.
 *
 * - `defineRoute` powers the generated, server-free builders (Layer 1).
 * - `callRoute` is the hand-written generic transport built on `fetch` (Layer 2).
 *
 * The request/response types are pulled off the route handler's
 * `__MIDDLEWARE_CONFIG` purely through the type system (`import type`), so no
 * server code reaches the client bundle.
 */

// Phantom carrier — present in the type only, never at runtime. Kept as a
// single *required* property so `TBody`/`TResponse` infer reliably even when
// the body is `undefined` (an optional phantom degrades to `unknown`).
declare const PHANTOM: unique symbol;

/**
 * The runtime value is just `{ url, method }`; `TBody`/`TResponse`/`TQuery` are
 * phantom (carried only in the type) and the runtime object is cast in
 * `defineRoute`. `TQuery` is the validated querystring shape, sent as
 * `searchParams` at call time (never baked into `url`).
 */
export type RouteDefinition<TMethod extends string, TBody, TResponse, TQuery = undefined> = {
  url: string;
  method: TMethod;
  readonly [PHANTOM]: { body: TBody; response: TResponse; query: TQuery };
};

// --- Type extraction off the handler type `H` (written once) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => any;

type Cfg<H extends Handler> = Awaited<ReturnType<H>>[typeof __MIDDLEWARE_CONFIG];
type Res<H extends Handler> = Cfg<H>["output"];
type Body<H extends Handler> = "schema" extends keyof Cfg<H> ? Cfg<H>["schema"] : undefined;
type Query<H extends Handler> = "querystring" extends keyof Cfg<H>
  ? Cfg<H>["querystring"]
  : undefined;

/**
 * Builds a server-free route builder. At runtime it returns a plain
 * `{ url, method }`; its type additionally carries the body/response/query
 * derived from the route's `config`.
 */
export function defineRoute<H extends Handler, Params = void, TMethod extends string = string>(
  urlFn: (params: Params) => string,
  method: TMethod,
) {
  return (params: Params): RouteDefinition<TMethod, Body<H>, Res<H>, Query<H>> =>
    ({ url: urlFn(params), method }) as RouteDefinition<TMethod, Body<H>, Res<H>, Query<H>>;
}

// Require `json` / `query` exactly when the route declares them; the options
// argument itself is optional only when neither is declared.
type CallOptions<TBody, TQuery> = ([TBody] extends [undefined]
  ? { json?: undefined }
  : { json: TBody }) &
  ([TQuery] extends [undefined] ? { query?: undefined } : { query: TQuery });
type CallArgs<TBody, TQuery> = [TBody | TQuery] extends [undefined]
  ? [options?: CallOptions<TBody, TQuery>]
  : [options: CallOptions<TBody, TQuery>];

/**
 * Performs the request and returns **exactly** the route's `output` union.
 *
 * `fetch` does not throw on HTTP error statuses, so declared error statuses
 * (e.g. 400/403/404) flow back as part of the union. Anything outside the
 * union — network failure, a non-JSON body, an unlisted status that isn't
 * valid JSON — throws. The response is trusted, never re-validated.
 */
export async function callRoute<TMethod extends string, TBody, TResponse, TQuery>(
  definition: RouteDefinition<TMethod, TBody, TResponse, TQuery>,
  ...[options]: CallArgs<NoInfer<TBody>, NoInfer<TQuery>>
): Promise<TResponse> {
  let url = definition.url;
  if (options?.query !== undefined) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query as Record<string, unknown>)) {
      if (value !== undefined) search.set(key, String(value));
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }
  const response = await fetch(url, {
    method: definition.method,
    ...(options?.json !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.json),
        }
      : {}),
  });

  return { status: response.status, json: await response.json() } as TResponse;
}

// --- Helpers to read a builder's phantom types (used by the pending hook) ---

export type RouteBuilder = (params: never) => RouteDefinition<string, unknown, unknown, unknown>;

export type ParamsOf<B extends RouteBuilder> = B extends (
  params: infer P,
) => RouteDefinition<string, unknown, unknown, unknown>
  ? P
  : never;

export type BodyOf<B extends RouteBuilder> =
  ReturnType<B> extends RouteDefinition<string, infer TBody, unknown, unknown> ? TBody : never;

export type ResponseOf<B extends RouteBuilder> =
  ReturnType<B> extends RouteDefinition<string, unknown, infer TResponse, unknown>
    ? TResponse
    : never;

export type QueryOf<B extends RouteBuilder> =
  ReturnType<B> extends RouteDefinition<string, unknown, unknown, infer TQuery> ? TQuery : never;
