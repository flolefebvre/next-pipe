# layoutPipe — layouts

`layoutPipe()` runs the middleware onion in front of a **layout**: the same gates and context injection as [`pagePipe`](page-pipe.md), with the handler receiving `children` and returning the React tree (output pinned to `React.ReactNode`).

```tsx
// app/(account)/layout.tsx
import { layoutPipe } from "@flefebvre/next-pipe/pipes";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";

export default layoutPipe()
  .use(AuthMiddleware) // redirects guests to /login, injects a typed `user`
  .handle(async ({ children, user }) => (
    <AccountShell user={user}>{children}</AccountShell>
  ));
```

Gating a layout gates every page under it — the classic use case for a route group like `(account)`. As with pages, layout middlewares leave the onion by throwing `redirect(...)` / `notFound()`, never by `interrupt` — see [Redirect-style gates](page-pipe.md#redirect-style-gates).

## Layout props (`children`, `params`, slots)

Pass Next's generated `LayoutProps<"/route">` as the generic — mirroring `pagePipe<PageProps<"...">>()` — and the pipe threads typed `children`, `params`, and any parallel-route slots into the handler input:

```tsx
// app/[team]/layout.tsx
export default layoutPipe<LayoutProps<"/[team]">>()
  .use(AuthMiddleware)
  .handle(async ({ children, params, user }) => {
    const { team } = await params;
    // ...
  });
```

Slots work the same way — `app/dashboard/@analytics` shows up as a typed `analytics: React.ReactNode` in the input:

```tsx
// app/dashboard/layout.tsx
export default layoutPipe<LayoutProps<"/dashboard">>().handle(
  async ({ children, analytics }) => (
    <>
      {children}
      {analytics}
    </>
  ),
);
```

Without a generic, the handler input holds `children` only.

## No `searchParams`, by design

Next never passes `searchParams` to a layout — layouts don't re-render on navigation, so the values would go stale. `layoutPipe`'s constraint rejects a prop type that includes `searchParams`, turning that misconception into a compile error at the pipe (the error points at the generic argument and mentions `never` — that's the guard firing). Read search params in the page, or in a client component via `useSearchParams`.

## See also

- [templatePipe](template-pipe.md) — the `template.tsx` twin
- [pagePipe](page-pipe.md) — pages, redirect-style gates, search-param validation
- [Core concepts](core-concepts.md) — `entry`, execution order, `OutputTypeMiddleware`
