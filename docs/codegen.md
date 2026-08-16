# Codegen — `next-pipe gen`

`next-pipe gen` scans your `app/` directory for route handlers and generates **server-free, fully typed client builders** for them. One command, no config files, no runtime schema registry:

```
$ npx next-pipe gen
✓ api/notes/[id]/like → src/generated/routes/api/notes/[id]/like.ts (GET, POST)
✓ barrel → src/generated/routes/index.ts

Generated 1 route module + barrel.
```

## How it works

The generator does **not** string-match your source. It builds a real TypeScript program from your `tsconfig.json` and asks the type-checker about each `route.ts`/`route.tsx`:

1. Enumerate the module's exports and keep the HTTP verbs (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`). Because this goes through the checker, `export const GET = ...`, `export async function GET()`, and re-exports (`export { GET } from "./handler"`) all work.
2. Check that each verb's awaited return type carries the `output` [config](core-concepts.md#the-config-channel) — the contract [`ResponseMiddleware`](built-in-middlewares.md#responsemiddleware) contributes (`routePipe()` includes it automatically). Verbs without it are skipped with a warning: they have no response type to expose.
3. Emit one module per route plus a `routes` barrel.

The generated files contain **`import type` only** — no server code can reach the client bundle. All request/response typing rides on the handler's type, extracted by [`defineRoute`](client.md#defineroute) at the type level.

## What gets generated

For `app/api/notes/[id]/like/route.ts`:

```ts
// src/generated/routes/api/notes/[id]/like.ts   (mirrors the app/ tree)
import { defineRoute } from "@flefebvre/next-pipe/client";
import type { GET as _GET, POST as _POST } from "@/app/api/notes/[id]/like/route";

export const GET = defineRoute<typeof _GET, { id: string }>(({ id }) => `/api/notes/${id}/like`, "GET");
export const POST = defineRoute<typeof _POST, { id: string }>(({ id }) => `/api/notes/${id}/like`, "POST");
```

Plus a browse-by-autocomplete barrel where static segments are properties, dynamic segments are calls, and verbs are zero-arg builders:

```ts
// src/generated/routes/index.ts
export const routes = {
  api: {
    notes: (id: string) => ({
      like: {
        GET: () => _r0.GET({ id }),
        POST: () => _r0.POST({ id }),
      },
    }),
  },
};
```

```ts
routes.api.notes(id).like.POST(); // → { url: "/api/notes/<id>/like", method: "POST" } + phantom types
```

Builders and barrel members carry the verb **verbatim** — `GET`, `POST`, `DELETE` — the same spelling as the handler you exported from `route.ts`, and the same string sent as the HTTP method.

The root route (if any) is emitted as `_root.ts` since `index.ts` is reserved for the barrel.

### Path features

| App segment | Generated |
| --- | --- |
| `[id]` | required `id: string` param |
| `[...slug]` | required `slug: string[]`, joined with `/` |
| `[[...slug]]` | optional `slug?: string[]` |
| `(group)` | stripped — never part of the URL |

## CLI reference

```
next-pipe gen [options]
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--app-dir <path>` | `./src/app` or `./app` (auto-detected) | The Next.js app directory to scan |
| `--out-dir <path>` | `<app-parent>/generated/routes` | Where generated modules are written. **Wiped on every run** — don't put hand-written files there |
| `--client-import <spec>` | `@flefebvre/next-pipe/client` | Import specifier the generated files pull `defineRoute` from |
| `--route-import-base <spec>` | `@/app` | Alias the generated files import route handler *types* from — must match your tsconfig `paths` |
| `--tsconfig <path>` | nearest `tsconfig.json` | The tsconfig used to type-check the handlers |
| `-h, --help` | | Show help |

## Workflow

- Add a script and re-run after adding, moving, or removing routes:

  ```jsonc
  // package.json
  { "scripts": { "gen": "next-pipe gen" } }
  ```

- The output directory is deleted and rebuilt on each run, so removed routes never leave stale builders behind.
- Either commit the generated files (simplest — they're small, readable TypeScript) or gitignore them and run `next-pipe gen` in your build/CI before `next build` and `tsc`.
- Body/query changes in a route **don't require re-running gen** — those types flow through `import type` and update live. Re-run only when the set of routes, verbs, or path params changes.

## Warnings you might see

- `⚠ <route>: GET has no response output type (missing ResponseMiddleware) — skipped.` — the verb isn't built with `routePipe()` (or a custom pipe ending in `ResponseMiddleware`), so there's no response union to expose.
- `⚠ <route>: no verb exports found — skipped.` — the file exports none of the seven HTTP verbs.
- `⚠ <route>: not part of the TypeScript program — skipped.` — the file isn't covered by the tsconfig's `include`; fix the tsconfig or pass `--tsconfig`.

## See also

- [Migrating](migrating.md) — upgrade notes when moving across a major version
- [Client & hooks](client.md) — `defineRoute`, `callRoute`, and `useApiCall`, which consume the generated builders
- [routePipe](route-pipe.md#the-response-union) — where the response union comes from
