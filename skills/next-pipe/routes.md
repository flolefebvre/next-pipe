# Route handlers — the full vertical

Write the route → validate → regenerate the client → call it. All four steps below, in order.

## 1. The route

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

Rules:

- The generic is Next's generated `RouteContext<"/path">` — a global, not imported. `ctx.params` is a **Promise**: always `await ctx.params`.
- Handler input = `{ req, ctx }` + whatever middlewares merged (`input`, `query`, `user`, …).
- Return `json(status, body)` — equivalent to `{ status, json: body } as const`. Never a raw `Response`.
- The route's response type is the union of every `json(...)` return **and** every middleware interrupt (401, 400, 404, …). That union is what the generated client sees.
- All seven verbs work (`GET POST PUT PATCH DELETE HEAD OPTIONS`), as `export const`, `export async function`, or re-exports.
- Each verb is its own pipe; share middlewares and loader functions by extracting them to consts.

## 2. Validation middlewares

```ts
.use(BodyValidationMiddleware, z.object({ like: z.boolean() }))
// merges input: z.infer<schema>; bad body → 400 { status: "error", error: { type: "schema", data: flattenedZodError } }

.use(QuerystringMiddleware, z.object({ limit: z.coerce.number().int().positive().optional() }))
// merges query: z.infer<schema>; bad query → 400 with error.type "querystring"
```

- Query values arrive as strings — use `z.coerce.*` for numbers/booleans. Repeated keys keep the last value.
- `BodyValidationMiddleware` consumes the request body and throws on non-JSON bodies — put it only on verbs that expect JSON.
- Their schemas also declare the `schema`/`querystring` configs that make `callRoute` require `json`/`query`.

## 3. Regenerate the client

```sh
pnpm gen   # or: npx next-pipe gen
```

- Re-run whenever the **set of routes, verbs, or path params** changes. Body/query type changes flow through `import type` live — no re-run needed.
- Only verbs built with `routePipe()` (or a custom pipe ending in `ResponseMiddleware`) are generated; others are skipped with a warning.
- Flags if defaults don't fit: `--app-dir`, `--out-dir` (wiped every run), `--route-import-base` (must match tsconfig `paths`, default `@/app`), `--tsconfig`.

## 4. Call it

```ts
import { callRoute } from "@flefebvre/next-pipe/client";
import { routes } from "@/generated/routes";

const res = await callRoute(routes.api.notes(id).like.POST(), { json: { like: true } });
// res: { status: 200; json: { liked: boolean } }
//    | { status: 401; json: { error: string } }
//    | { status: 400; json: … }

if (res.status === 200) res.json.liked; // narrowed by status
```

In the barrel, static segments are properties, dynamic segments are calls (`notes(id)`), verbs are zero-arg builders named after the verb verbatim (`.POST()`, not `.post()`; `definition.method` is `"POST"`).

`callRoute` semantics:

- `json` / `query` options are required **exactly when** the route declares the matching middleware; a route with neither takes no options.
- Declared statuses come back as values to narrow on — never thrown. Anything outside the union (network failure, non-JSON body) **throws**.
- Responses are trusted, not runtime-validated.
- Works anywhere `fetch` does: client components, server components, tests.

In client components, wrap with the hook:

```tsx
"use client";
import { useApiCall } from "@flefebvre/next-pipe/client";
import { routes } from "@/generated/routes";

const [toggleLike, isLiking] = useApiCall(() => routes.api.notes(props.id).like.POST(), {
  onSuccess: (res) => {
    switch (res.status) {
      case 200: setLiked(res.json.liked); break;
      case 400: setError("Invalid request"); break;
      default:  setError(res.json.error); // remaining union members
    }
  },
});

<button onClick={() => toggleLike({ json: { like: !liked } })} disabled={isLiking} />
```

`useApiCall` wraps `useTransition`; the dispatch argument mirrors `callRoute`'s rules. There is no `onError`: a thrown `callRoute` error propagates.

## Done when

- The route typechecks, `gen` has been re-run if routes/verbs/params changed, and every client call site narrows the full response union (no ignored 4xx members).
