# templatePipe — templates

`templatePipe()` is the [`layoutPipe`](layout-pipe.md) twin for **`template.tsx`**: identical mechanics — middleware onion in front, `children` in the handler input, output pinned to `React.ReactNode` — with a stricter prop constraint matching what Next actually passes a template.

```tsx
// app/notes/template.tsx
import { templatePipe } from "@flefebvre/next-pipe/pipes";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";

export default templatePipe()
  .use(AuthMiddleware)
  .handle(async ({ children, user }) => (
    <FadeIn owner={user.id}>{children}</FadeIn>
  ));
```

## `children` only

A template receives a keyed `children` prop and **nothing else** — no `params`, no `searchParams`. `templatePipe`'s constraint rejects both at compile time (the error mentions `never` — that's the guard firing). If you need `params`, you want a [layout](layout-pipe.md); if you need `searchParams`, you want the [page](page-pipe.md) or a client component with `useSearchParams`.

One limitation to know: TypeScript's structural typing can't ban *arbitrary* extra props, so only the named mistakes (`params`, `searchParams`) are guarded — slot-style extras slip through the constraint. Next won't pass them to a template regardless.

## Layout or template?

Same prop shape (minus `params`), different lifecycle: a layout **persists** across navigations within its segment; a template **remounts** — state resets, effects re-run, and `children` gets a fresh key. That difference lives entirely in Next's renderer; pick the file convention for the lifecycle you want and the matching pipe follows.

## See also

- [layoutPipe](layout-pipe.md) — layouts, `LayoutProps`, parallel-route slots
- [pagePipe](page-pipe.md) — pages, redirect-style gates, search-param validation
- [Core concepts](core-concepts.md) — `entry`, execution order, `OutputTypeMiddleware`
