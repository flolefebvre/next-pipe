# Pages & layouts

`pagePipe()` runs the same middleware onion in front of a page; the handler returns JSX (output pinned to `React.ReactNode`).

```tsx
// app/notes/page.tsx
import { pagePipe } from "@flefebvre/next-pipe/pipes";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";

export default pagePipe()
  .use(AuthMiddleware) // redirects guests to /login, injects typed `user`
  .handle(async ({ user }) => {
    const notes = db.listNotes();
    return <main>Signed in as {user.username}</main>;
  });
```

## Gates redirect, they don't interrupt

Page middlewares leave the onion by **throwing** — `redirect(...)` or `notFound()` from `next/navigation` — not by `interrupt(...)`:

```ts
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

export class GuestMiddleware extends BeforeMiddleware {
  async before() {
    if (await getSessionUser()) redirect("/notes"); // for login/signup pages
    return next({});
  }
}
```

Because these read the session from cookies (no arguments), the same classes work unchanged in `pagePipe`, `actionPipe`, and `formActionPipe`.

## Page props

Pass Next's generated `PageProps<"/route">` (a global) as the generic to get typed `params`/`searchParams` in the handler input — both are **Promises**:

```tsx
// app/notes/[id]/page.tsx
export default pagePipe<PageProps<"/notes/[id]">>()
  .use(AuthMiddleware)
  .handle(async ({ params, searchParams, user }) => {
    const { id } = await params;
    const { q } = await searchParams;
    // ...
  });
```

No generic → handler input starts empty. Middlewares can depend on props like any input:

```ts
class NoteLoaderMiddleware extends BeforeMiddleware {
  async before(arg: { params: Promise<{ id: string }> }) {
    const note = db.findNote((await arg.params).id);
    if (!note) notFound();
    return next({ note });
  }
}
```

## Validating search params

```tsx
import { SearchParamsMiddleware } from "@flefebvre/next-pipe/middlewares/pages";

export default pagePipe<PageProps<"/notes">>()
  .use(AuthMiddleware)
  .use(SearchParamsMiddleware, z.object({ q: z.string().optional().catch(undefined), page: z.coerce.number().catch(1) }))
  .handle(async ({ query, user }) => { /* query is typed */ });
```

- Requires the `PageProps` generic (it depends on `searchParams` being in the input).
- A failing schema calls `notFound()` — the 404 page. Since query strings are user-editable URLs, **prefer lenient fields** (`.catch(default)`, `.optional().catch(undefined)`); reserve strict (404ing) fields for params the page truly cannot render without.
- Values arrive as `string | string[] | undefined` — use `z.coerce.*` for non-strings.

## Layouts and templates

`layoutPipe()` / `templatePipe()` run the same onion in front of `layout.tsx` / `template.tsx`; the handler receives `children` (output pinned to `React.ReactNode`). Gating a layout gates every page beneath it:

```tsx
// app/(account)/layout.tsx
import { layoutPipe } from "@flefebvre/next-pipe/pipes";

export default layoutPipe()
  .use(AuthMiddleware)
  .handle(async ({ children, user }) => <AccountShell user={user}>{children}</AccountShell>);
```

- Pass `LayoutProps<"/path">` (generated global) as the generic for typed `params` and parallel-route slots (`app/x/@modal` → `modal: React.ReactNode` in the input). No generic → input is `children` only.
- Layouts never receive `searchParams` (they don't re-render on navigation) — the constraint rejects it at compile time; a type error mentioning `never` on the generic is that guard firing. Read search params in the page instead.
- `templatePipe` is the `template.tsx` twin: same mechanics, and its constraint also rejects `params` — templates get only a keyed `children`. Only these two named props are guarded; structural typing can't ban arbitrary extras.

## Done when

- The page typechecks, gates redirect (never interrupt), `params`/`searchParams` are awaited, and search-param schemas are lenient unless a 404 is genuinely correct.
- Layouts/templates use their dedicated pipes; anything needing `searchParams` lives in a page, not a layout.
