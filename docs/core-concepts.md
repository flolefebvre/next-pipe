# Core concepts

Everything in next-pipe is built from one primitive: a **pipe** — an onion of middlewares wrapped around a handler. This page explains the execution model that every pipe (`routePipe`, `actionPipe`, `formActionPipe`, `pagePipe`) shares.

## The onion

A pipe is assembled with `.use(Middleware, ...args)` calls and sealed with `.handle(fn)`:

```ts
export const POST = routePipe()
  .use(LoggerMiddleware)      // 1st in, last out
  .use(AuthMiddleware)        // 2nd in, 2nd-to-last out
  .use(BodyValidationMiddleware, schema)
  .handle(async (input) => { ... });
```

Each middleware has two phases:

- **`before(input)`** runs on the way *in*, in `.use()` order. It returns either
  - `next({ ... })` — merge these values into the handler's input and continue, or
  - `interrupt(value)` — stop here; the handler never runs.
- **`after(output)`** runs on the way *out*, in **reverse** `.use()` order. It receives the handler's return value (or a later middleware's interrupt) and may transform it.

```
request ──▶ Logger.before ─▶ Auth.before ─▶ Validation.before ─▶ handler
                                                                    │
response ◀── Logger.after ◀─ Auth.after ◀─ Validation.after ◀──────┘
```

## `next` — building the handler's input

Every `next({ ... })` merges its keys into a single accumulating object, which is what the handler finally receives. Later middlewares win on key conflicts, and — crucially — later middlewares can *depend* on earlier ones through their `before` parameter type:

```ts
export class RouteRoleMiddleware extends BeforeMiddleware {
  constructor(private role: Role) { super(); }

  // Requires `user` in its input — so the type-checker rejects the pipe
  // unless something earlier (RouteAuthMiddleware) provided it.
  async before(arg: { user: SafeUser }) {
    if (arg.user.role !== this.role) {
      return interrupt({ status: 403, json: { error: "Forbidden" } } as const);
    }
    return next({});
  }
}
```

Putting `.use(RouteRoleMiddleware, "admin")` before `.use(RouteAuthMiddleware)` is a compile error, not a runtime surprise.

## `interrupt` — typed short-circuits

An `interrupt(value)` skips the handler and everything after the interrupting middleware. The value then travels back **through the `after`s of the middlewares composed *earlier*** and is returned to the caller.

Two consequences:

1. **Interrupts join the output type.** A route middleware that interrupts with `{ status: 401, json: ... }` adds that shape to the route's response union — the same union `next-pipe gen` exposes to the [generated client](client.md).
2. **Placement matters for observers.** A logging middleware only sees the interrupts of middlewares composed *after* it — so a logger goes first if it should log every 401/403/404 short-circuit.

## Base classes

Import from `@flefebvre/next-pipe/middlewares`:

| Class | Implement | Use for |
| --- | --- | --- |
| `BeforeMiddleware` | `before` only | Gates, validation, context injection (auth, entity loading) |
| `AfterMiddleware<T>` | `after` only | Output transformation; `T` pins what the handler must return |
| `Middleware<T>` | both | Cross-cutting concerns (logging, timing) |

`AfterMiddleware<T>`'s type parameter is a *contract on the handler*: `ResponseMiddleware extends AfterMiddleware<{ status: number; json: JsonValue }>` is what forces route handlers to return `{ status, json }` objects, and `OutputTypeMiddleware<T>` is a pure type-pin with an identity `after` (it's how `actionPipe` enforces the `ActionResult` protocol and `pagePipe` enforces `React.ReactNode`).

See [Write your own middleware](custom-middlewares.md) for the authoring guide.

## `entry` — adapting the raw call signature

`.handle()` produces a plain async function whose parameters are defined by the pipe's **entry**: `entry(fn)` maps the raw arguments to the initial input object.

```ts
// This is (simplified) how routePipe is built:
new Pipe(entry((req: Request, ctx: Context) => ({ req, ctx })))
  .use(ResponseMiddleware);
```

The built-in pipes each pick the right entry for their surface (route: `(req, ctx)`, action: `(input)`, form action: `(prevState, formData)`, page: `(props)`), so you rarely touch `entry` directly — it's there when you want a [custom pipe](page-pipe.md#rolling-your-own-page-pipe).

## The success/error protocol (actions)

Actions and form actions speak a discriminated-union result protocol instead of HTTP statuses:

```ts
import { success, error } from "@flefebvre/next-pipe/server";

return success({ id });          // { status: "success", data: { id } }
return error("forbidden", msg);  // { status: "error", error: { type: "forbidden", data: msg } }
```

Error *keys* are typed end to end: middleware interrupts (`error("notFound", ...)`) and handler returns (`error("forbidden", ...)`) accumulate into one union, which the client reads back key-by-key with [`getActionError`](client.md#getactionerror).

## The `config` channel

Middlewares can declare metadata about the pipe with a `config` type (never a runtime value):

```ts
export class BodyValidationMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  // ...
  declare config: MiddlewareConfig<"schema", z.infer<TSchema>>;
}
```

Configs accumulate across the pipe and are attached (as a type only) to the handler's return type. This is the contract [codegen](codegen.md) and the [client](client.md) read: `schema` becomes the request body type, `querystring` the query type, and `output` (contributed by `ResponseMiddleware`) the response union.

## Where to next

- [routePipe](route-pipe.md) · [actionPipe](action-pipe.md) · [formActionPipe](form-action-pipe.md) · [pagePipe](page-pipe.md)
- [Built-in middlewares](built-in-middlewares.md) · [Write your own middleware](custom-middlewares.md)
- [Codegen](codegen.md) · [Client & hooks](client.md)
