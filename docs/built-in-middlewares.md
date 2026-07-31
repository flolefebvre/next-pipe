# Built-in middlewares

next-pipe ships a small set of middlewares covering the mechanical parts of each surface: validation, response shaping, and output typing. Everything else (auth, roles, entity loading, logging) is deliberately left to [your own middlewares](custom-middlewares.md) — those depend on your app's session and data layer.

| Middleware | Import from | Surface | Auto-wired by |
| --- | --- | --- | --- |
| [`ResponseMiddleware`](#responsemiddleware) | `.../middlewares/routes` | routes | `routePipe()` |
| [`BodyValidationMiddleware`](#bodyvalidationmiddleware) | `.../middlewares/routes` | routes | — |
| [`QuerystringMiddleware`](#querystringmiddleware) | `.../middlewares/routes` | routes | — |
| [`InputValidationMiddleware`](#inputvalidationmiddleware) | `.../middlewares/actions` | actions | `actionPipe(schema)` |
| [`FormValidationMiddleware`](#formvalidationmiddleware) | `.../middlewares/form-actions` | form actions | `formActionPipe(schema)` |
| [`SearchParamsMiddleware`](#searchparamsmiddleware) | `.../middlewares/pages` | pages | — |
| [`OutputTypeMiddleware`](#outputtypemiddleware) | `.../middlewares` | any | `actionPipe()`, `formActionPipe()`, `pagePipe()` |

The validation middlewares require the optional `zod` (v4) peer dependency.

## ResponseMiddleware

An [`AfterMiddleware`](core-concepts.md#base-classes) that converts `{ status, json }` objects into `NextResponse.json(json, { status })`. Because `routePipe()` composes it **first**, its `after` runs **last** — so it converts handler returns *and* every middleware interrupt (`401`, `400`, `404`, ...) into real responses.

It also declares the `output` [config](core-concepts.md#the-config-channel): the union of everything that flowed through it. That config is what [`next-pipe gen`](codegen.md) requires a verb export to have — a route built without `ResponseMiddleware` gets no generated client.

You only reach for it manually when building a custom route pipe from `Pipe`/`entry`.

## BodyValidationMiddleware

```ts
.use(BodyValidationMiddleware, z.object({ like: z.boolean() }))
```

- Reads `req.json()` and parses it with the schema.
- **Success** → merges `input: z.infer<typeof schema>` into the handler's input.
- **Failure** → interrupts with `{ status: 400, json: { status: "error", error: { type: "schema", data: flattenedZodError } } }`.
- **Config** → declares `schema`, which becomes the required `json` body of the [generated client call](client.md#callroute).

Note: it consumes the request body, and a non-JSON body makes `req.json()` throw — put it only on verbs that expect JSON.

## QuerystringMiddleware

```ts
.use(QuerystringMiddleware, z.object({ limit: z.coerce.number().int().positive().optional() }))
```

- Collects `URL(req.url).searchParams` into an object and parses it with the schema.
- **Success** → merges `query: z.infer<typeof schema>` into the handler's input.
- **Failure** → interrupts with `{ status: 400, json: { status: "error", error: { type: "querystring", data: flattenedZodError } } }`.
- **Config** → declares `querystring`, which becomes the `query` argument of the [generated client call](client.md#callroute).

Query values are always strings — use `z.coerce.*` for anything else. Repeated keys (`?a=1&a=2`) keep the last value.

## InputValidationMiddleware

Auto-wired by `actionPipe(schema)`; validates the action's single argument.

- **Success** → merges the parsed value as `input`.
- **Failure** → interrupts with `error("schema", flattenedZodError)` — a typed member of the action's [result union](action-pipe.md#input-validation).

## FormValidationMiddleware

Auto-wired first by `formActionPipe(schema)`, or chained explicitly on a schemaless `formActionPipe()` to place validation *after* other middlewares — the [auth-before-validation](form-action-pipe.md#auth-before-validation) pattern. Validates the object collected from `FormData`.

- **Success** → merges the parsed value as `input` (overriding the raw entries downstream).
- **Failure** → interrupts with `error("schema", flattenedZodError)` **plus** an `input` field echoing back the submitted values (best-effort parsed per field; invalid fields become `undefined`).
- Its `after` also merges that echoed `input` into handler-returned results, so forms can repopulate whatever the outcome — see [formActionPipe](form-action-pipe.md#how-input-echoing-works). Results produced upstream of this middleware (e.g. an auth interrupt before it) carry no `input`.

## SearchParamsMiddleware

```ts
.use(SearchParamsMiddleware, z.object({ q: z.string().optional(), page: z.coerce.number().catch(1) }))
```

The page-flavored counterpart of `QuerystringMiddleware`, for pipes built with [`pagePipe<PageProps<"...">>()`](page-pipe.md#page-props-params-searchparams) (it depends on `searchParams` being in the pipe input).

- Awaits the page's `searchParams` and parses the object with the schema.
- **Success** → merges `query: z.infer<typeof schema>` into the handler's input.
- **Failure** → calls `notFound()`, rendering the 404 page — a page has no 400-JSON channel to answer on.

Because a query string is a user-editable URL, prefer encoding *leniency in the schema* over letting strict failures 404: `z.coerce.number().catch(1)` falls back to a default, `.optional().catch(undefined)` ignores a malformed value. Reserve strict (404ing) fields for params the page genuinely cannot render without. Values arrive as `string | string[] | undefined` — use `z.coerce.*` for anything non-string.

## OutputTypeMiddleware

```ts
.use(OutputTypeMiddleware<ActionResult>)
```

A pure type-pin: identity at runtime, but it constrains what the handler may return. `actionPipe` uses it to enforce the `ActionResult` protocol and `pagePipe` to enforce `React.ReactNode`. Useful in custom pipes whenever you want the handler's output contractually fixed.

## See also

- [Write your own middleware](custom-middlewares.md) — the patterns these are built with (and the auth/role/entity-loader middlewares you'll write yourself)
- [Core concepts](core-concepts.md#the-config-channel) — how `schema`/`querystring`/`output` configs reach the client
