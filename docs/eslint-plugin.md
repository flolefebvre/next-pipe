# The `pipe.ts` convention & the ESLint plugin

A pipe is only worth building if every entry point actually goes through it. The `pipe.ts` convention makes that mechanical — one file per segment declares the pipes that segment's files must be built from — and `@flefebvre/next-pipe/eslint-plugin` enforces it.

## The convention

A file named exactly **`pipe.ts`** may live in any directory. It exports pre-composed pipes, and its **export names are the contract**:

| Export         | Governs                                     |
| -------------- | ------------------------------------------- |
| `pagePipe`     | `page.tsx` / `page.ts`                      |
| `layoutPipe`   | `layout.tsx` / `layout.ts`                  |
| `templatePipe` | `template.tsx` / `template.ts`              |
| `routePipe`    | every HTTP verb of `route.ts` / `route.tsx` |
| `actionPipe`   | the exports of a `"use server"` file        |
| `formActionPipe` | the exports of a `"use server"` file      |

Those six names are the only value exports a `pipe.ts` may declare. Type-only exports (`export type Options = …`) are fine — they carry no runtime surface. The filename is reserved by the convention: if you lint a tree that already uses `pipe.ts` for something else, scope the rule to your app directory with a `files` pattern (see below) rather than the recommended config.

```ts
// src/app/pipe.ts
import { pagePipe as basePagePipe, routePipe as baseRoutePipe } from "@flefebvre/next-pipe/pipes";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";

export const pagePipe = basePagePipe().use(AuthMiddleware);
export const routePipe = baseRoutePipe().use(AuthMiddleware);
```

The `as basePagePipe` rename is the whole trick: the local name stays free for the *composed* pipe, so files below import `pagePipe` and get the app's version of it, not the library's.

```tsx
// src/app/notes/page.tsx
import { pagePipe } from "@/app/pipe";

export default pagePipe.handle(async ({ user }) => <main>Hi {user.username}</main>);
```

### Layering

`pipe.ts` files stack. A deeper one imports the one above it and adds to it:

```ts
// src/app/admin/pipe.ts
import { pagePipe as appPagePipe } from "../pipe";
import { AdminMiddleware } from "@/lib/middlewares/admin-middleware";

export const pagePipe = appPagePipe.use(AdminMiddleware);
```

### Precedence: the closest one wins

For a given kind, the **closest `pipe.ts` at or above the file that exports that name** governs it — nothing else. A page under `app/admin/users/` whose `app/admin/users/pipe.ts` exports `pagePipe` must be built from *that* one; importing `app/admin/pipe.ts` instead would silently skip a layer of middlewares, and is reported.

Where no `pipe.ts` above a file exports its kind, the file is ungoverned and may do whatever it likes — including, in a `pipe.ts` with no ancestor, building a pipe straight from the `/server` primitives (`new Pipe(entry(…))`, `createPipe()`).

## Setup

`eslint` is an **optional** peer dependency (`>=9`): install it only if you lint. The plugin is flat-config only.

```js
// eslint.config.mjs
import nextPipe from "@flefebvre/next-pipe/eslint-plugin";

export default [
  // your other config…
  ...nextPipe.configs.recommended,
];
```

`configs.recommended` registers the plugin under the `next-pipe` namespace and turns `next-pipe/use-pipe-file` on as an **error** for `**/*.{ts,tsx}`. To wire it by hand instead:

```js
import nextPipe from "@flefebvre/next-pipe/eslint-plugin";

export default [
  {
    files: ["src/app/**/*.{ts,tsx}"],
    plugins: { "next-pipe": nextPipe },
    rules: { "next-pipe/use-pipe-file": "error" },
  },
];
```

The plugin needs a TypeScript-capable parser on the files it lints — [`typescript-eslint`](https://typescript-eslint.io) in practice, which any TypeScript ESLint setup already has. Its own type declarations import nothing from `eslint`, so a `// @ts-check`ed config spreads `configs.recommended` without a cast.

## `next-pipe/use-pipe-file`

> When a `pipe.ts` at a file's level or above exports a pipe of the file's kind, the file must build its handler(s) from that pipe.

No autofix, no suggestions — the fix is a decision about which middlewares belong, not a mechanical edit.

### What is checked

| File                                          | Checked exports                              | Kind                             |
| --------------------------------------------- | -------------------------------------------- | -------------------------------- |
| `page` / `layout` / `template`                 | the default export                            | `pagePipe` / `layoutPipe` / `templatePipe` |
| `route`                                        | `GET POST PUT PATCH DELETE HEAD OPTIONS`      | `routePipe`                      |
| any file whose directive prologue has `"use server"` | every value export                      | `actionPipe` / `formActionPipe`  |
| `pipe.ts`                                      | each of its six possible exports              | the export's own name            |

Those four Next.js entry points are recognized under **both** extensions — `page.tsx` and `page.ts`, `route.ts` and `route.tsx` — because Next.js accepts either and renaming a file must not be a way out of the rule. `pipe.ts` alone is matched exactly: if `pipe.tsx` could govern too, which one wins in a directory holding both would be anybody's guess.

Everything else — `default.tsx`, `loading.tsx`, `error.tsx`, `.js` files — is ignored. TypeScript only. `"use server"` counts anywhere in the directive prologue (`"use strict"; "use server";` is a server-action module), but a **function-level** directive is out of scope: the exported binding there is a plain function, not a module export the convention can speak about.

### The accepted chain

For a handler: the governing binding, imported from the governing `pipe.ts`, then zero or more `.use(…)`, then `.handle(…)`.

```tsx
import { pagePipe } from "@/app/pipe";
export default pagePipe.use(SomeOther).handle(async () => <div />); // ✅
```

Same-file intermediates are fine, and so are imports resolved through a `paths` alias (`@/app/admin/pipe`) or a relative specifier (`../pipe`) — imports are resolved with TypeScript, against the nearest `tsconfig.json`.

```tsx
const page = pagePipe.use(SomeOther);
export default page.handle(async () => <div />); // ✅
```

A `pipe.ts` export stops before `.handle(…)`: it is still a pipe, so the governing binding plus zero or more `.use(…)` is the accepted shape there.

Anything else that is governed is reported:

```tsx
import { pagePipe } from "@flefebvre/next-pipe/pipes";
export default pagePipe().handle(async () => <div />);   // ❌ rooted in the library constructor

export default async function Page() { return <div />; } // ❌ bare handler

import { pagePipe } from "@/app/pipe";                   // ❌ skips app/admin/users/pipe.ts
export default pagePipe.handle(async () => <div />);

export const GET = someImportedThing;                    // ❌ not a pipe chain
```

In a `"use server"` file, an export whose chain roots in a recognizable kind is checked against **that kind only**; an export with no recognizable root is reported naming every governed action kind:

```
deleteNote must be built from actionPipe or formActionPipe exported by src/app/pipe.ts.
```

If neither action kind is governed, bare exports are left alone.

A `pipe.ts` that exports anything outside the six names is reported too, default exports included:

```
pipe.ts may only export pagePipe, layoutPipe, templatePipe, routePipe, actionPipe or formActionPipe; 'helper' is not one of them.
```

### Following exports across files

Re-exports and imported bindings are followed rather than waved through — the rule resolves the target module, parses it, finds the binding and analyzes the chain there:

```ts
export { GET } from "./handlers";        // followed into ./handlers
import { GET } from "./handlers";        // …and so is this form
export { GET };
export default Page;                     // where Page is imported
```

A cycle of re-exports terminates on a visited set.

### Known limitation

`export * from "…"` is treated as unanalyzable and skipped **silently**: the names it contributes cannot be known without resolving and reading the target, and a file re-exporting a star has no export declaration to report on. Prefer named re-exports in `route.ts` and `"use server"` files if you want them checked.

### Performance

The rule never builds a `ts.Program` and never runs the type checker — every question it asks is syntactic. Parsed files are cached by path and mtime, resolved `tsconfig.json` options by the config they came from, so linting a whole app parses each `pipe.ts` once.

Module resolutions and the location of the nearest `tsconfig.json` are cached for the life of the process. In a one-shot `eslint .` that is exactly right; in a long-lived editor session, *adding* a `tsconfig.json` or a new module may need a restart of the language server before the rule sees it.
