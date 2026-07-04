# pagePipe — pages and server components

`pagePipe()` runs the same middleware onion in front of a **page**: gates and context injection happen in middlewares, and the handler returns the React tree (the pipe pins its output type to `React.ReactNode`).

```tsx
// app/notes/page.tsx
import { pagePipe } from "@flefebvre/next-pipe/pipes";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";

export default pagePipe()
  .use(AuthMiddleware) // redirects guests to /login, injects a typed `user`
  .handle(async ({ user }) => {
    const notes = db.listNotes();
    return (
      <main>
        <p>Signed in as {user.username}</p>
        {/* ... */}
      </main>
    );
  });
```

The same `AuthMiddleware` that gates your actions gates your pages — write the session logic once, `.use` it everywhere.

## Redirect-style gates

Page middlewares typically don't `interrupt` — they **redirect**. `redirect(...)` from `next/navigation` throws, which is a perfectly valid way to leave the onion early:

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
```

And the inverse, for pages that only make sense *without* a session:

```tsx
export class GuestMiddleware extends BeforeMiddleware {
  async before() {
    if (await getSessionUser()) redirect("/notes");
    return next({});
  }
}

// app/login/page.tsx
export default pagePipe()
  .use(GuestMiddleware)
  .handle(async () => <LoginForm />);
```

Because these middlewares read the session from cookies rather than from arguments, the same classes work in `pagePipe`, `actionPipe`, and `formActionPipe` unchanged.

## Page props (`params`, `searchParams`)

Pass Next's generated `PageProps<"/route">` as the generic — mirroring `routePipe<RouteContext<"...">>()` — and the pipe threads typed `params`/`searchParams` into the handler input:

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

Both are promises (Next.js 15+ semantics), and both are part of the pipe input like anything else — so middlewares can depend on them:

```ts
class NoteLoaderMiddleware extends BeforeMiddleware {
  async before(arg: { params: Promise<{ id: string }> }) {
    const note = db.findNote((await arg.params).id);
    if (!note) notFound();
    return next({ note });
  }
}
```

Without a generic, the handler input starts empty — pages that don't need props don't mention them.

### Validating search params

Instead of hand-narrowing `string | string[] | undefined` values, validate them with [`SearchParamsMiddleware`](built-in-middlewares.md#searchparamsmiddleware) and receive a typed `query`:

```tsx
import { SearchParamsMiddleware } from "@flefebvre/next-pipe/middlewares/pages";

export default pagePipe<PageProps<"/notes">>()
  .use(AuthMiddleware)
  .use(SearchParamsMiddleware, z.object({ q: z.string().optional().catch(undefined) }))
  .handle(async ({ query, user }) => {
    const notes = db.listNotes().filter((note) => !query.q || note.content.includes(query.q));
    // ...
  });
```

A query failing the schema renders the 404 page — keep fields lenient with `.catch(...)` fallbacks unless the page truly cannot render without them.

### Rolling your own page pipe

For prop shapes beyond `params`/`searchParams` — a **layout**, say, which receives `children` — build a pipe with an explicit [`entry`](core-concepts.md#entry--adapting-the-raw-call-signature):

```tsx
// app/(account)/layout.tsx
import { entry, Pipe } from "@flefebvre/next-pipe/server";
import { OutputTypeMiddleware } from "@flefebvre/next-pipe/middlewares";

type Props = { children: React.ReactNode };

export default new Pipe(entry((props: Props) => ({ ...props })))
  .use(OutputTypeMiddleware<React.ReactNode>)
  .use(AuthMiddleware)
  .handle(async ({ children, user }) => <AccountShell user={user}>{children}</AccountShell>);
```

This is the exact recipe `pagePipe` itself uses, minus the fixed prop shape.

## See also

- [Core concepts](core-concepts.md) — `entry`, execution order, `OutputTypeMiddleware`
- [Write your own middleware](custom-middlewares.md) — gates, loaders, and parametrized middlewares
