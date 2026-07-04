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

## Done when

- The package (and zod, if any validation middleware will be used) is installed.
- If routes are in scope: the `gen` script exists, `pnpm gen` runs cleanly, and the generated output is either committed or gitignored+wired into CI.
- At least the auth middleware compiles against the project's real session logic.
