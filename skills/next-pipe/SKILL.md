---
name: next-pipe
description: Write Next.js server code with next-pipe (@flefebvre/next-pipe). Use when creating or modifying route handlers, server actions, form actions, or pages in a project that depends on @flefebvre/next-pipe; when calling API routes from the client; when writing middlewares (auth, validation, entity loading) for those surfaces; or when the user mentions next-pipe, including installing or setting it up.
---

# next-pipe

next-pipe (`@flefebvre/next-pipe`) is a typed, onion-model middleware system for the four Next.js App Router server entry points — route handlers, server actions, form actions, and pages — plus a generated, fully typed client for routes.

> This skill documents **v0.2.0**. If the installed `@flefebvre/next-pipe` version differs, or a snippet from this skill doesn't typecheck, trust the package's `.d.ts` in `node_modules` over this text.

## The onion

A pipe is a chain of `.use(Middleware, ...args)` calls sealed with `.handle(fn)`. Each middleware's `before(input)` runs in `.use()` order and either returns `next({ ... })` — merging typed values into the handler's input — or `interrupt(value)` — skipping the handler; the value travels back out through the `after`s of *earlier* middlewares and **joins the pipe's output type** (routes: the response union; actions: the error union). `after(output)` runs in reverse order on the way out. A middleware depends on earlier ones by typing its `before` parameter (e.g. `before(arg: { user: SafeUser })`) — composing it too early is a compile error, not a runtime bug.

## Which pipe for which surface

| Surface | File | Pipe | Handler returns |
| --- | --- | --- | --- |
| Route handler | `app/**/route.ts` | `routePipe<RouteContext<"/path">>()` | `json(status, body)` |
| Server action (called from code) | `"use server"` file | `actionPipe(schema?)` | `success(data?)` / `error(key, data)` |
| Form action (`<form>` + `useActionState`) | `"use server"` file | `formActionPipe(schema?)` | `error(key, data)` or `redirect(...)` |
| Page / server component | `app/**/page.tsx` | `pagePipe<PageProps<"/path">>()` | JSX (`React.ReactNode`) |

`RouteContext` and `PageProps` are Next.js-generated globals — no import needed.

## Import map

Subpath imports are strict — these are the only entry points:

| Import from | Exports |
| --- | --- |
| `@flefebvre/next-pipe/pipes` | `routePipe`, `actionPipe`, `formActionPipe`, `pagePipe` |
| `@flefebvre/next-pipe/server` | `next`, `interrupt`, `success`, `error`, `json`, `Pipe`, `entry`, `createPipe`, `merge` |
| `@flefebvre/next-pipe/client` | `callRoute`, `useApiCall`, `getActionError`, `getActionInput`, `defineRoute` |
| `@flefebvre/next-pipe/middlewares` | `BeforeMiddleware`, `AfterMiddleware`, `Middleware`, `OutputTypeMiddleware`, `MiddlewareConfig` |
| `@flefebvre/next-pipe/middlewares/routes` | `ResponseMiddleware`, `BodyValidationMiddleware`, `QuerystringMiddleware` |
| `@flefebvre/next-pipe/middlewares/actions` | `InputValidationMiddleware` |
| `@flefebvre/next-pipe/middlewares/form-actions` | `FormValidationMiddleware` |
| `@flefebvre/next-pipe/middlewares/pages` | `SearchParamsMiddleware` |

## Iron rules

1. **Every server entry point goes through a pipe.** In a project using next-pipe, never write a bare route handler, server action, form action, or gated page — build it with the matching pipe so its middlewares and typed contract apply.
2. **Interrupt in the surface's dialect**: routes → `interrupt({ status, json } as const)`; actions and form actions → `interrupt(error(key, data))`; pages → `redirect(...)` / `notFound()` (they throw, no interrupt needed).
3. **Route interrupts and manual returns need `as const`** (the `json()` helper does it for you) — without it, `status` widens to `number` and the client union stops discriminating.
4. **Route handlers return `{ status, json }` via `json(status, body)`** — never a raw `Response`/`NextResponse`; `ResponseMiddleware` does the conversion.
5. **Re-run codegen (`next-pipe gen`) after adding, removing, or moving routes, verbs, or path params.** Body/query type changes flow through `import type` automatically and need no re-run.
6. **Client code imports only from `@flefebvre/next-pipe/client` and the generated routes barrel** — never from `/server`, `/pipes`, or middleware files.
7. **Follow the project's existing conventions first** (middleware location, script names, generated-output path); only when there is no precedent, use this skill's defaults: `lib/middlewares/`, a `"gen": "next-pipe gen"` script, generated output at `src/generated/routes`.

## Task files

Load exactly the file for the job at hand:

- **[setup.md](setup.md)** — load when installing next-pipe, wiring codegen, or writing the project's first middleware.
- **[routes.md](routes.md)** — load when creating or editing a route handler, or calling a route from the client (`callRoute` / `useApiCall`).
- **[actions.md](actions.md)** — load when creating or editing a server action or form action, or reading their results (`getActionError`).
- **[pages.md](pages.md)** — load when putting middlewares in front of a page or layout (auth gates, search-param validation).
- **[custom-middlewares.md](custom-middlewares.md)** — load when writing or modifying a middleware class.
