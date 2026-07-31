# next-pipe

[![npm](https://img.shields.io/npm/v/%40flefebvre%2Fnext-pipe)](https://www.npmjs.com/package/@flefebvre/next-pipe)
[![license](https://img.shields.io/npm/l/%40flefebvre%2Fnext-pipe)](./LICENSE)

A typed, onion-model middleware system for Next.js route handlers, server actions, form actions, and pages — plus a generated, fully typed client for your routes.

**Requires** Next.js ≥ 16 (App Router), React ≥ 19, TypeScript ≥ 5, Node ≥ 22. `zod` v4 is an optional peer dependency, needed only by the validation middlewares.

> Early release (0.x): the API is still settling and minor versions may contain breaking changes.

## Why

The Next.js App Router gives you four server entry points — route handlers, server actions, form actions, and pages — and no middleware system for any of them. So every file re-implements the same prologue by hand: check the session, parse and validate the input, load the entity or 404, shape the error response. next-pipe replaces that with one onion-model middleware system that works identically across all four surfaces, on top of the native Next.js primitives (your `route.ts` stays a plain HTTP endpoint, your actions stay server actions). Because middlewares are typed end to end — including their short-circuit responses — a generated client can read back the *exact* response union of every route.

```ts
export const POST = routePipe<RouteContext<"/api/notes/[id]/like">>()
  .use(AuthMiddleware) //                                            → 401
  .use(BodyValidationMiddleware, z.object({ like: z.boolean() })) // → 400
  .handle(async ({ ctx, input, user }) => {
    const { id } = await ctx.params;
    await db.setLike(id, user.username, input.like);
    return json(200, { liked: input.like });
  });
```

The 401 and 400 paths you didn't write are still there — handled by the middlewares, turned into real `Response`s, and included in this route's response type, which the generated client gets for free.

### How is this different from…

- **next-safe-action / zsa** — excellent action builders, but they cover server actions only. next-pipe applies the same middleware model to route handlers, form actions, and pages too, and adds the generated typed client for routes.
- **tRPC** — replaces your HTTP surface with an RPC router that the client must import. next-pipe keeps native `route.ts` endpoints (callable by anything — webhooks, mobile apps, curl); client types come from codegen over `import type`, so no server code approaches the client bundle.
- **ts-rest / Hono** — contract-first or bring-your-own-framework: you describe the API separately, then implement it. next-pipe goes the other way and derives the contract from the handlers you already wrote.

## Install

```sh
pnpm add @flefebvre/next-pipe
# optional, for the validation middlewares and actionPipe(schema)/formActionPipe(schema);
# the schemaless actionPipe()/formActionPipe() work without it:
pnpm add zod
```

## Quickstart: a route, its client

### 1. Write a middleware

A middleware is a class with a `before` step (and optionally an `after` step). `before` either merges typed values into the handler's input with `next(...)`, or short-circuits with `interrupt(...)`:

```ts
// lib/middlewares/auth-middleware.ts
import { next, interrupt } from "@flefebvre/next-pipe/server";
import { BeforeMiddleware } from "@flefebvre/next-pipe/middlewares";
import { getSessionUser } from "@/lib/auth"; // your own session logic

export class AuthMiddleware extends BeforeMiddleware {
  async before() {
    const user = await getSessionUser();
    if (!user) {
      // Short-circuits the handler. The interrupt travels back through the
      // `after` chain, becomes a real 401 Response, and joins the route's
      // response union.
      return interrupt({ status: 401, json: { error: "Not signed in" } } as const);
    }
    // Merged into the handler's input, fully typed.
    return next({ user });
  }
}
```

### 2. Build the route

`routePipe()` wires in `ResponseMiddleware` for you: handlers return plain `{ status, json }` objects (the `json()` helper keeps them precisely typed) and they come out as real `Response`s:

```ts
// app/api/notes/[id]/like/route.ts
import z from "zod";
import { routePipe } from "@flefebvre/next-pipe/pipes";
import { json } from "@flefebvre/next-pipe/server";
import { BodyValidationMiddleware } from "@flefebvre/next-pipe/middlewares/routes";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";
import { db } from "@/lib/db";

export const POST = routePipe<RouteContext<"/api/notes/[id]/like">>()
  .use(AuthMiddleware)
  .use(BodyValidationMiddleware, z.object({ like: z.boolean() }))
  .handle(async ({ ctx, input, user }) => {
    // input is { like: boolean }, user comes from AuthMiddleware — all typed.
    const { id } = await ctx.params;
    await db.setLike(id, user.username, input.like);
    return json(200, { liked: input.like });
  });
```

### 3. Generate the client

```
$ npx next-pipe gen
✓ api/notes/[id]/like → src/generated/routes/api/notes/[id]/like.ts (POST)
✓ barrel → src/generated/routes/index.ts
```

The generator walks your `app/` directory with the TypeScript type checker and emits one tiny module per route plus a `routes` barrel. Generated files use `import type` only, so no server code can leak into the client bundle. Tip: add `"gen": "next-pipe gen"` to your `package.json` scripts and re-run it when routes change.

### 4. Call it — with the exact response union

```ts
import { callRoute } from "@flefebvre/next-pipe/client";
import { routes } from "@/generated/routes";

const res = await callRoute(routes.api.notes(id).like.post(), { json: { like: true } });
// res: { status: 200; json: { liked: boolean } }
//    | { status: 401; json: { error: string } }
//    | { status: 400; json: … }  ← schema failure, with typed field errors

if (res.status === 200) {
  res.json.liked; // boolean
}
```

`callRoute` requires `json` (and `query`) exactly when the route declares them, and returns the union of everything the route can answer — handler returns *and* middleware interrupts. In client components, `useApiCall(builder)` wraps this with `useTransition` pending state — see [Client & hooks](docs/client.md).

## Package map

| Import | Exports | Docs |
| --- | --- | --- |
| `@flefebvre/next-pipe/pipes` | `routePipe`, `actionPipe`, `formActionPipe`, `pagePipe` | [route](docs/route-pipe.md) · [action](docs/action-pipe.md) · [form](docs/form-action-pipe.md) · [page](docs/page-pipe.md) |
| `@flefebvre/next-pipe/server` | `Pipe`, `entry`, `createPipe`, `next`, `interrupt`, `success`, `error`, `json`, `merge` | [Core concepts](docs/core-concepts.md) |
| `@flefebvre/next-pipe/client` | `callRoute`, `defineRoute`, `useApiCall`, `getActionError`, `getActionInput` | [Client & hooks](docs/client.md) |
| `@flefebvre/next-pipe/middlewares` | `Middleware`, `BeforeMiddleware`, `AfterMiddleware`, `OutputTypeMiddleware` + authoring types | [Custom middlewares](docs/custom-middlewares.md) |
| `@flefebvre/next-pipe/middlewares/routes` | `ResponseMiddleware`, `BodyValidationMiddleware`, `QuerystringMiddleware` | [Built-in middlewares](docs/built-in-middlewares.md) |
| `@flefebvre/next-pipe/middlewares/actions` | `InputValidationMiddleware` | [Built-in middlewares](docs/built-in-middlewares.md) |
| `@flefebvre/next-pipe/middlewares/form-actions` | `FormValidationMiddleware` | [Built-in middlewares](docs/built-in-middlewares.md) |
| `@flefebvre/next-pipe/middlewares/pages` | `SearchParamsMiddleware` | [Built-in middlewares](docs/built-in-middlewares.md) |
| `next-pipe` (bin) | `next-pipe gen` | [Codegen](docs/codegen.md) |

## Going further

- **[Core concepts](docs/core-concepts.md)** — the onion model: `before`/`after` phases, `next` vs `interrupt`, how context merges across middlewares, and why interrupts flow back through the `after`s of earlier middlewares.
- **[routePipe](docs/route-pipe.md)** — route handlers: response unions, `RouteContext` params, status/json typing.
- **[actionPipe](docs/action-pipe.md)** — typed server actions: zod input validation, the `success`/`error` result shape, reading errors with `getActionError`.
- **[formActionPipe](docs/form-action-pipe.md)** — `<form>` actions: `FormData` parsing, schema validation, typed field errors back to the form.
- **[pagePipe](docs/page-pipe.md)** — run the same middlewares in front of a page or server component (e.g. redirect guests to `/login`).
- **[Built-in middlewares](docs/built-in-middlewares.md)** — body, querystring, input and form validation; response shaping; output typing.
- **[Write your own middleware](docs/custom-middlewares.md)** — `BeforeMiddleware`, `AfterMiddleware`, parametrized constructors (`.use(M, ...args)`), interrupts, and the `config` type channel that feeds the generated client.
- **[Codegen](docs/codegen.md)** — how `next-pipe gen` analyzes routes through the TypeScript checker, every CLI flag, and CI setup.
- **[Client & hooks](docs/client.md)** — `defineRoute`, `callRoute` semantics (declared statuses return, everything else throws), and the `useApiCall` hook.

## Agent skill

If you use an AI coding agent (Claude Code, Cursor, Codex, …), this repo ships an installable [skill](skills/next-pipe/SKILL.md) that teaches the agent next-pipe's pipes, middlewares, codegen, and client:

```sh
npx skills add flolefebvre/next-pipe
```

(Uses the [skills CLI](https://github.com/vercel-labs/skills); or just copy `skills/next-pipe/` into your agent's skills directory, e.g. `.claude/skills/`.)

## License

[MIT](./LICENSE)
