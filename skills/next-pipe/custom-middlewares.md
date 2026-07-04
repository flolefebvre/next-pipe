# Writing middlewares

Pick the base class by job (all from `@flefebvre/next-pipe/middlewares`):

| Job | Extend | Implement |
| --- | --- | --- |
| Gate, validation, context injection (auth, entity loading) | `BeforeMiddleware` | `before` |
| Output transformation, or pinning what the handler must return | `AfterMiddleware<T>` | `after` |
| Both directions (logging, timing) | `Middleware<T>` | both |

Interrupt in the surface's dialect: routes → `interrupt({ status, json } as const)`; actions/form actions → `interrupt(error(key, data))`; pages → `redirect(...)`/`notFound()` (throw, no interrupt). A middleware that reads its context from cookies/headers rather than arguments works on every surface unchanged.

## The minimal gate

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

- `next({ user })` merges a typed `user` into the handler input of every pipe that `.use`s this.
- `as const` keeps the interrupt literal (`status: 401`, not `number`) — required for the client union to discriminate.
- The interrupt automatically joins the route's response union; the generated client sees the 401.

## Depending on earlier middlewares + parametrization

Type the `before` parameter with what you need — the pipe only compiles when something earlier provides it. Constructor args are supplied as extra `.use` arguments:

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

// .use(RouteRoleMiddleware, "admin") — compiles only after .use(RouteAuthMiddleware)
```

Rule: dependencies come through the `before` parameter type; options come through the constructor.

## Generic middlewares — the entity loader

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

// .use(RouteEntityLoaderMiddleware, "note", loadNote) → handler sees `note`; missing → typed 404
```

The loader receives the accumulated pipe input (`ctx`, `user`, …). The action-flavored twin interrupts with `error("notFound", ...)` instead.

## `after` and placement

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

- Inside `after`, the current output type is `this["After"]`. Return it unchanged → type-identity; return something else → transforms the pipe's output type (how `ResponseMiddleware` turns `{ status, json }` into `Response`).
- **Placement rule**: an interrupt only flows back through the `after`s of middlewares composed *earlier* than the interrupter. Compose a logger **first** or it misses the 401/403/404 short-circuits of gates below it.
- `AfterMiddleware<T>` doubles as a handler contract; `OutputTypeMiddleware<T>` is the runtime-identity version (pins the return type only).

## The `config` channel (feeding the generated client)

Declare a `config` **type** (never a runtime value) when the middleware should shape the generated client:

```ts
import { type MiddlewareConfig } from "@flefebvre/next-pipe/middlewares";

export class BodyValidationMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  // ...
  declare config: MiddlewareConfig<"schema", z.infer<TSchema>>;
}
```

Configs accumulate across the pipe and ride on the handler's return type, where codegen and `callRoute` read them. Reserved keys: `schema` (required `json` body), `querystring` (required `query`), `output` (response union — contributed by `ResponseMiddleware`; its presence is what makes a verb generatable). Declare `config` only when the client needs to know.

## Done when

- The middleware compiles, interrupts in the correct dialect with `as const` where applicable, takes dependencies via the `before` parameter and options via the constructor, and pipes using it place observers (loggers) before the gates they should observe.
