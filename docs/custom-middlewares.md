# Write your own middleware

Custom middlewares are where next-pipe earns its keep: auth gates, role checks, entity loaders, loggers — written once, `.use`d on any pipe. This page walks through every authoring pattern, from a minimal gate to generic parametrized middlewares.

Make sure you've read [Core concepts](core-concepts.md) first — the execution order (`before`s in `.use()` order, `after`s in reverse, interrupts flowing back through earlier `after`s) is assumed throughout.

## The minimal gate

Extend `BeforeMiddleware`, implement `before`, return `next(...)` or `interrupt(...)`:

```ts
import { next, interrupt } from "@flefebvre/next-pipe/server";
import { BeforeMiddleware } from "@flefebvre/next-pipe/middlewares";
import { getSessionUser } from "@/lib/auth";

export class RouteAuthMiddleware extends BeforeMiddleware {
  async before() {
    const user = await getSessionUser();
    if (!user) {
      return interrupt({ status: 401, json: { error: "Not signed in" } } as const);
    }
    return next({ user });
  }
}
```

Three things to notice:

- **`next({ user })`** merges a typed `user` into the handler's input. Whoever `.use`s this middleware gets `user` for free.
- **`interrupt(...)`** short-circuits; on a route pipe the value flows back through `ResponseMiddleware.after` and becomes a real 401 — *and* a member of the route's response union.
- **`as const`** keeps the interrupt literal (`status: 401`, not `number`), which is what makes the client-side union discriminate cleanly.

The interrupt shape must match the surface: routes interrupt with `{ status, json }`, actions with `error(key, data)`, and page middlewares usually [`redirect(...)` instead](page-pipe.md#redirect-style-gates).

## Depending on earlier middlewares

Type your `before` parameter with what you need, and the pipe only type-checks when something earlier provides it:

```ts
export class RouteRoleMiddleware extends BeforeMiddleware {
  constructor(private role: User["role"]) {
    super();
  }

  async before(arg: { user: SafeUser }) {
    if (arg.user.role !== this.role) {
      return interrupt({ status: 403, json: { error: `Requires the "${this.role}" role` } } as const);
    }
    return next({});
  }
}
```

`.use(RouteRoleMiddleware, "admin")` compiles only *after* `.use(RouteAuthMiddleware)` — ordering mistakes are compile errors.

This example also shows **parametrization**: constructor arguments are supplied as extra `.use` arguments — `.use(RouteRoleMiddleware, "admin")` constructs `new RouteRoleMiddleware("admin")` per invocation.

## Generic middlewares

Type parameters make one middleware reusable across entities. The classic: an entity loader that owns the not-found policy (à la Rails' `before_action :set_note`):

```ts
export class RouteEntityLoaderMiddleware<
  TKey extends string,
  TArg extends object,
  TEntity,
> extends BeforeMiddleware {
  constructor(
    private key: TKey,
    private load: (arg: TArg) => TEntity | undefined | Promise<TEntity | undefined>,
  ) {
    super();
  }

  async before(arg: TArg) {
    const entity = await this.load(arg);
    if (entity === undefined) {
      return interrupt({ status: 404, json: { error: `${this.key} not found` } } as const);
    }
    return next({ [this.key]: entity } as Record<TKey, TEntity>);
  }
}
```

```ts
.use(RouteEntityLoaderMiddleware, "note", loadNote)
// handler sees `note: Note`; a missing note is a typed 404 in the response union
```

The loader receives the accumulated pipe input (so it can read `ctx.params`, `user`, ...), and the key + loader return type drive the handler's input type. The action-flavored twin is identical except its interrupt speaks the result protocol: `interrupt(error("notFound", ...))`.

## Acting on the way out: `after`

`AfterMiddleware<T>` transforms output; `Middleware<T>` does both directions. A logger is the canonical both-ways, type-identity middleware:

```ts
import { next } from "@flefebvre/next-pipe/server";
import { Middleware } from "@flefebvre/next-pipe/middlewares";

export class LoggerMiddleware extends Middleware {
  async before(arg: { req: Request }) {
    console.log(`→ ${arg.req.method} ${new URL(arg.req.url).pathname}`);
    return next({});
  }

  async after(output: this["After"]) {
    const status = output && typeof output === "object" && "status" in output ? output.status : "?";
    console.log(`← ${status}`);
    return output;
  }
}
```

Inside `after`, the current output type is available as `this["After"]`. Returning it unchanged makes the middleware a type-identity (it adds nothing to the pipe's output type); returning something else transforms the output — that's how `ResponseMiddleware` turns `{ status, json }` into a `Response`.

**Placement rule:** an interrupt only travels back through the `after`s of middlewares composed *earlier* than the interrupting one. Compose a logger **first** so it sees the 401/403/404/400 short-circuits of every gate below it, not just handler responses.

`AfterMiddleware<T>`'s type parameter doubles as a handler contract — see [`OutputTypeMiddleware`](built-in-middlewares.md#outputtypemiddleware) for the degenerate-but-useful case.

## The `config` channel

If your middleware should influence the *generated client* — declare a `config` type:

```ts
import { type MiddlewareConfig } from "@flefebvre/next-pipe/middlewares";

export class BodyValidationMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  // ...
  declare config: MiddlewareConfig<"schema", z.infer<TSchema>>;
}
```

`config` is purely a type (`declare` — nothing at runtime). Configs accumulate across the pipe and ride on the handler's return type, where [codegen](codegen.md) and [`callRoute`](client.md#callroute) read them. The keys with built-in meaning:

- `schema` — the request body type (`callRoute` requires `json` of this type),
- `querystring` — the query type (`callRoute` requires `query` of this type),
- `output` — the response union (contributed by `ResponseMiddleware`; its presence is what makes a verb [generatable](codegen.md#what-gets-generated)).

## Checklist

- Gate or context injection → extend `BeforeMiddleware`.
- Output transformation or handler contract → extend `AfterMiddleware<T>`.
- Both directions (logging, timing) → extend `Middleware`, keep `after` an identity unless you mean it.
- Interrupt with the surface's shape: `{ status, json } as const` for routes, `error(key, data)` for actions, `redirect(...)` for pages.
- Take dependencies through your `before` parameter type; take options through the constructor.
- Declare `config` only when the client needs to know.
