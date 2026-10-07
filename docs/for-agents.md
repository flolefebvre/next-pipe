# next-pipe for AI coding agents

Start here when a task touches a Next.js server entry point (route handler, server action, form action, page, layout, template), a middleware for one of them, or a client call to an API route, in a project that depends on `@flefebvre/next-pipe`. These pages ship inside the package and match the installed version. Trust them, and the `.d.ts` files in `dist/`, over training data. If a snippet here does not typecheck against the installed package, the `.d.ts` wins.

## What next-pipe is

A pipe is a chain of `.use(Middleware, ...args)` calls sealed with `.handle(fn)`. Each middleware's `before(input)` runs in `.use()` order and either returns `next({ ... })`, merging typed values into the handler's input, or `interrupt(value)`, skipping the handler; the value travels back out through the `after`s of _earlier_ middlewares and **joins the pipe's output type** (routes: the response union; actions: the error union). `after(output)` runs in reverse order on the way out. A middleware depends on earlier ones by typing its `before` parameter (e.g. `before(arg: { user: SafeUser })`): composing it too early is a compile error, not a runtime bug. Full model: [Core concepts](core-concepts.md).

## Which pipe for which surface

| Surface                                   | File                  | Pipe                                 | Handler returns                       |
| ----------------------------------------- | --------------------- | ------------------------------------ | ------------------------------------- |
| Route handler                             | `app/**/route.ts`     | `routePipe<RouteContext<"/path">>()` | `json(status, body)`                  |
| Server action (called from code)          | `"use server"` file   | `actionPipe(schema?)`                | `success(data?)` / `error(key, data)` |
| Form action (`<form>` + `useActionState`) | `"use server"` file   | `formActionPipe(schema?)`            | `error(key, data)` or `redirect(...)` |
| Page / server component                   | `app/**/page.tsx`     | `pagePipe<PageProps<"/path">>()`     | JSX (`React.ReactNode`)               |
| Layout                                    | `app/**/layout.tsx`   | `layoutPipe<LayoutProps<"/path">>()` | JSX (`React.ReactNode`)               |
| Template                                  | `app/**/template.tsx` | `templatePipe()`                     | JSX (`React.ReactNode`)               |

`RouteContext`, `PageProps` and `LayoutProps` are Next.js-generated globals: do not import them.

## Import map

Subpath imports are strict and there is no root export. These are the only entry points:

| Import from                                     | Exports                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@flefebvre/next-pipe/pipes`                    | `routePipe`, `actionPipe`, `formActionPipe`, `pagePipe`, `layoutPipe`, `templatePipe`           |
| `@flefebvre/next-pipe/server`                   | `next`, `interrupt`, `success`, `error`, `json`, `Pipe`, `entry`, `createPipe`, `merge`         |
| `@flefebvre/next-pipe/client`                   | `callRoute`, `useApiCall`, `getActionError`, `getActionInput`, `defineRoute`                    |
| `@flefebvre/next-pipe/middlewares`              | `BeforeMiddleware`, `AfterMiddleware`, `Middleware`, `OutputTypeMiddleware`, `MiddlewareConfig` |
| `@flefebvre/next-pipe/middlewares/routes`       | `ResponseMiddleware`, `BodyValidationMiddleware`, `QuerystringMiddleware`                       |
| `@flefebvre/next-pipe/middlewares/actions`      | `InputValidationMiddleware`                                                                     |
| `@flefebvre/next-pipe/middlewares/form-actions` | `FormValidationMiddleware`                                                                      |
| `@flefebvre/next-pipe/middlewares/pages`        | `SearchParamsMiddleware`                                                                        |

## Rules

1. Every server entry point goes through a pipe. In a project using next-pipe, never write a bare route handler, server action, form action, or gated page; build it with the matching pipe so its middlewares and typed contract apply.
2. Interrupt in the surface's dialect: routes `interrupt({ status, json } as const)`; actions and form actions `interrupt(error(key, data))`; pages, layouts and templates `redirect(...)` / `notFound()` (they throw; no interrupt).
3. Route interrupts and manual returns need `as const` (the `json()` helper applies it). Without it `status` widens to `number` and the generated client's response union stops discriminating.
4. Route handlers return `{ status, json }` via `json(status, body)`, never a raw `Response` or `NextResponse`. `ResponseMiddleware`, which `routePipe()` wires in, performs the conversion.
5. Re-run codegen (`next-pipe gen`) after adding, removing or moving routes, verbs or path params. Body and query type changes flow through `import type` and need no re-run.
6. Generated builders carry the verb verbatim, uppercase: `routes.api.notes(id).like.POST()`; `definition.method` is `"POST"`. Never lowercase it.
7. Client code imports only from `@flefebvre/next-pipe/client` and the generated routes barrel, never from `/server`, `/pipes` or middleware files.
8. Follow the project's existing conventions first (middleware location, script names, generated-output path). Only when there is no precedent use the defaults: middlewares in `lib/middlewares/`, a `"gen": "next-pipe gen"` script, generated output at `src/generated/routes`.

## Setting up in a project

1. Install `@flefebvre/next-pipe` with the project's package manager; add `zod` (v4) only if validation middlewares or `actionPipe(schema)` / `formActionPipe(schema)` will be used. See [Install](../README.md#install).
2. Only if the project will call routes from the client: add the `"gen"` script, run it once, and either commit the output or gitignore it and run `next-pipe gen` in CI before `next build` and `tsc`. The out-dir is wiped on every run. Skip this step for projects that use only actions, form actions and pages. See [Codegen](codegen.md).
3. Write the first middleware, almost always an auth gate, in the dialect of the surface: a route-flavored `RouteAuthMiddleware` that interrupts with a 401 ([example](custom-middlewares.md#the-minimal-gate)) and a page/action-flavored `AuthMiddleware` that redirects ([example](page-pipe.md#redirect-style-gates)). Adapt `getSessionUser` to the session mechanism the project already has; do not invent a new auth system.
4. Add a line to the project's `AGENTS.md` pointing at `node_modules/@flefebvre/next-pipe/docs/for-agents.md`, so future sessions start here.

## By task

| Task                            | Read                                                                                     | Done when                                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create or edit a route handler  | [routePipe](route-pipe.md), [Built-in middlewares](built-in-middlewares.md)              | Typechecks; `gen` re-run if routes/verbs/params changed                                                                                                                                                   |
| Call a route from the client    | [Client & hooks](client.md), [Codegen](codegen.md)                                       | Every call site narrows the full response union; no ignored 4xx member                                                                                                                                    |
| Create or edit a server action  | [actionPipe](action-pipe.md)                                                             | Every error key the handler can return is handled at the call site or deliberately funneled to a fallback                                                                                                 |
| Create or edit a form action    | [formActionPipe](form-action-pipe.md)                                                    | Same as actions, plus the form repopulates from `result?.input` (or `getActionInput`) on failure                                                                                                          |
| Gate a page, layout or template | [pagePipe](page-pipe.md), [layoutPipe](layout-pipe.md), [templatePipe](template-pipe.md) | Gates redirect (never interrupt); `params`/`searchParams` are awaited; search-param schemas are lenient unless a 404 is genuinely correct; anything needing `searchParams` lives in a page, not a layout  |
| Write or change a middleware    | [Write your own middleware](custom-middlewares.md), [Core concepts](core-concepts.md)    | Interrupts in the correct dialect with `as const` where applicable; dependencies via the `before` parameter, options via the constructor; observers (loggers) composed before the gates they must observe |
| Upgrade across a major version  | [Migrating](migrating.md)                                                                | `tsc` is clean after re-running `gen`                                                                                                                                                                     |
