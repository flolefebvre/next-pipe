# Setting up next-pipe

Requirements: Next.js ≥ 16 (App Router), React ≥ 19, TypeScript ≥ 5, Node ≥ 22.

## 1. Install

```sh
pnpm add @flefebvre/next-pipe
# zod v4 is an optional peer dep — required for the validation middlewares
# and for actionPipe(schema) / formActionPipe(schema):
pnpm add zod
```

Use the project's package manager (`npm install` / `yarn add` / `bun add` equivalents are fine).

## 2. Wire codegen (only if the project will call routes from the client)

```jsonc
// package.json
{ "scripts": { "gen": "next-pipe gen" } }
```

- Default output: `src/generated/routes` (or `generated/routes` next to a root `app/`). The out-dir is **wiped on every run** — never put hand-written files there.
- Either commit the generated files (simplest), or gitignore them and run `next-pipe gen` in CI before `next build` and `tsc`.
- Skip this step entirely for projects that only use actions/form actions/pages.

## 3. Write the first middleware

Almost every project starts with an auth gate. Default location `lib/middlewares/` (follow existing conventions if the project has them):

```ts
// lib/middlewares/route-auth-middleware.ts  (route-flavored: interrupts with { status, json })
import { next, interrupt } from "@flefebvre/next-pipe/server";
import { BeforeMiddleware } from "@flefebvre/next-pipe/middlewares";
import { getSessionUser } from "@/lib/auth"; // the project's own session logic

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

```ts
// lib/middlewares/auth-middleware.ts  (page/action-flavored: redirects instead)
import { redirect } from "next/navigation";
import { next } from "@flefebvre/next-pipe/server";
import { BeforeMiddleware } from "@flefebvre/next-pipe/middlewares";
import { getSessionUser } from "@/lib/auth";

export class AuthMiddleware extends BeforeMiddleware {
  async before() {
    const user = await getSessionUser();
    if (!user) redirect("/login");
    return next({ user });
  }
}
```

Adapt `getSessionUser` to whatever session mechanism the project already has — do not invent a new auth system.

## 4. Declare the segment's pipes in a `pipe.ts`

Rather than repeating `.use(AuthMiddleware)` in every file, put the composed pipes in a `pipe.ts` — one per segment that needs its own middlewares. The export names are the contract: `pagePipe`, `layoutPipe`, `templatePipe`, `routePipe`, `actionPipe`, `formActionPipe`, and nothing else (type-only exports aside).

```ts
// src/app/pipe.ts
import { pagePipe as basePagePipe, routePipe as baseRoutePipe } from "@flefebvre/next-pipe/pipes";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";

export const pagePipe = basePagePipe().use(AuthMiddleware);
export const routePipe = baseRoutePipe().use(AuthMiddleware);
```

```tsx
// src/app/notes/page.tsx
import { pagePipe } from "@/app/pipe";

export default pagePipe.handle(async ({ user }) => <main>Hi {user.username}</main>);
```

The `as basePagePipe` rename frees the local name for the composed pipe. `pipe.ts` files layer: a deeper one imports the one above (`import { pagePipe as appPagePipe } from "../pipe"`) and adds to it. The **closest** `pipe.ts` at or above a file that exports the file's kind is the one it must be built from — reaching past it skips a layer of middlewares.

## 5. Turn on the ESLint plugin (optional, recommended)

`next-pipe/use-pipe-file` checks that every governed `page`, `layout`, `template`, `route` file (either extension) and every `"use server"` export is really built from the governing `pipe.ts`. Flat config only; `eslint` is an optional peer dependency (`>=9`).

```js
// eslint.config.mjs
import nextPipe from "@flefebvre/next-pipe/eslint-plugin";

export default [
  // your other config…
  ...nextPipe.configs.recommended,
];
```

## Done when

- The package (and zod, if any validation middleware will be used) is installed.
- If routes are in scope: the `gen` script exists, `pnpm gen` runs cleanly, and the generated output is either committed or gitignored+wired into CI.
- At least the auth middleware compiles against the project's real session logic.
- If the project has segment-wide middlewares: a `pipe.ts` exports them and the files below import from it.
