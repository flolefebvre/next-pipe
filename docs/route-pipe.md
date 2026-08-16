# routePipe — route handlers

`routePipe()` builds a Next.js [route handler](https://nextjs.org/docs/app/api-reference/file-conventions/route) (`app/**/route.ts`) out of middlewares. It wires in [`ResponseMiddleware`](built-in-middlewares.md#responsemiddleware) for you, so handlers return plain `{ status, json }` objects and the pipe turns them into real `Response`s.

```ts
// app/api/notes/[id]/like/route.ts
import z from "zod";
import { routePipe } from "@flefebvre/next-pipe/pipes";
import { json } from "@flefebvre/next-pipe/server";
import { BodyValidationMiddleware } from "@flefebvre/next-pipe/middlewares/routes";
import { RouteAuthMiddleware } from "@/lib/middlewares/route-auth-middleware";

export const POST = routePipe<RouteContext<"/api/notes/[id]/like">>()
  .use(RouteAuthMiddleware)                                       // → 401
  .use(BodyValidationMiddleware, z.object({ like: z.boolean() })) // → 400
  .handle(async ({ ctx, input, user }) => {
    const { id } = await ctx.params;
    await db.setLike(id, user.username, input.like);
    return json(200, { liked: input.like });
  });
```

## Handler input

The pipe's entry maps the raw `(req, ctx)` route-handler arguments to `{ req, ctx }`; every middleware then merges its contributions:

- `req: Request` — the incoming request.
- `ctx` — the route context; `ctx.params` is a `Promise` (Next.js 15+ semantics). Type it by passing Next's generated `RouteContext<"/path">` as the generic: `routePipe<RouteContext<"/api/notes/[id]/like">>()`.
- Anything middlewares add — `input` from `BodyValidationMiddleware`, `query` from `QuerystringMiddleware`, `user` from your auth middleware, etc.

## Returning responses

Handlers return `{ status, json }`. The `json()` helper keeps both precisely typed (literal status, exact json shape):

```ts
import { json } from "@flefebvre/next-pipe/server";

return json(200, { liked: true });
// equivalent to: return { status: 200, json: { liked: true } } as const;
```

`ResponseMiddleware` (composed first, so its `after` runs last) converts whatever comes out of the onion — handler return **or** middleware interrupt — into `NextResponse.json(json, { status })`.

## The response union

A route's response type is the union of everything it can answer:

- every `return json(...)` in the handler,
- every `interrupt({ status, json })` from its middlewares (401 from auth, 400 from validation, 404 from an entity loader, ...).

This union is the route's *contract*. [`next-pipe gen`](codegen.md) extracts it and the [generated client](client.md) returns exactly that union from `callRoute` — no `any`, no hand-written response types:

```ts
const res = await callRoute(routes.api.notes(id).like.POST(), { json: { like: true } });
// res: { status: 200; json: { liked: boolean } }
//    | { status: 401; json: { error: string } }
//    | { status: 400; json: ... }
```

## Validating the request

Two built-in middlewares cover the common cases — see [Built-in middlewares](built-in-middlewares.md) for their exact interrupt shapes:

```ts
.use(BodyValidationMiddleware, z.object({ like: z.boolean() }))
// → handler gets `input: { like: boolean }`; invalid body interrupts with a 400

.use(QuerystringMiddleware, z.object({ limit: z.coerce.number().int().positive().optional() }))
// → handler gets `query: { limit?: number }`; invalid query interrupts with a 400
```

Since query values arrive as strings, use `z.coerce.*` for numbers and booleans.

## Multiple verbs, shared middlewares

Each verb export is its own pipe; share pieces by extracting them:

```ts
const loadNote = async ({ ctx }: { ctx: RouteContext<"/api/notes/[id]/like"> }) => {
  const { id } = await ctx.params;
  return db.findNote(id); // undefined → the loader middleware interrupts with a 404
};

export const POST = routePipe<RouteContext<"/api/notes/[id]/like">>()
  .use(RouteAuthMiddleware)
  .use(RouteEntityLoaderMiddleware, "note", loadNote)
  .handle(async ({ note, user }) => { ... });

export const GET = routePipe<RouteContext<"/api/notes/[id]/like">>()
  .use(RouteAuthMiddleware)
  .use(RouteEntityLoaderMiddleware, "note", loadNote)
  .handle(async ({ note }) => { ... });
```

All standard verbs are supported (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`), including as `export async function` declarations or re-exports — [codegen](codegen.md) resolves them through the type-checker either way.

## See also

- [Core concepts](core-concepts.md) — execution order, interrupts, the config channel
- [Write your own middleware](custom-middlewares.md) — auth gates, role gates, entity loaders
- [Codegen](codegen.md) and [Client & hooks](client.md) — turning the response union into a typed client
