# Activity — what a return to a page looks like

With [Cache Components](https://nextjs.org/docs/app/getting-started/caching) on (`cacheComponents: true`), Next.js no longer unmounts a route when the user leaves it. It hides it in React's [`<Activity>`](https://react.dev/reference/react/Activity) and keeps it alive, up to 3 routes per segment. Coming back shows the route as it was left: the half-typed draft, the open dialog, the "Saved" message, the error under a field.

Sometimes that is what the user wants. Often it is stale. next-pipe lets each page and layout choose, with one option on its pipe:

```tsx
// app/notes/new/page.tsx — every return is a first visit (the default)
export default pagePipe().handle(async () => <NewNoteForm />);

// app/notes/page.tsx — Back restores the list, a link opens it fresh
export default pagePipe<PageProps<"/notes">>({ visits: "restore" }).handle(
  /* … */
);

// app/dashboard/layout.tsx — every return restores everything
export default layoutPipe<LayoutProps<"/dashboard">>({ visits: "keep" }).handle(
  /* … */
);
```

| `visits`            | A return by link or `router.push` | A return by Back / Forward | Mechanism                                |
| ------------------- | --------------------------------- | -------------------------- | ---------------------------------------- |
| `"fresh"` (default) | first visit                       | first visit                | the subtree is remounted while hidden    |
| `"restore"`         | first visit                       | as it was left             | `<Fragment key={useRouter().bfcacheId}>` |
| `"keep"`            | as it was left                    | as it was left             | nothing: Next's own behaviour            |

Without Cache Components, Next unmounts routes on navigation and every policy behaves like `"fresh"`.

## Why `fresh` is the default

`fresh` gives back what an App Router page did before Cache Components: a page you come back to is a page you load. Nothing typed for one visit leaks into the next, no success message greets a user who never submitted, no dialog is open on arrival. A page that should restore state opts in, deliberately, with `restore` or `keep`.

The subtree is remounted while it is still hidden, from the same server payload, so nothing stale is ever painted, and the browser still restores the window's scroll position on Back: the remounted page has the same height, unless its height depends on client state (sections the user expanded, rows fetched on the client). Three guards make it safe to use everywhere:

- **One remount per return, in dev too.** The remount waits for a microtask and is cancelled if the page is shown again first. `next dev` runs React's StrictMode, which re-runs layout effects when a hidden tree is shown again; that never costs a second remount.
- **Only a navigation resets.** A Suspense fallback above the page (an urgent update that suspends, for instance a `loading.tsx` shown again by a non-transition update) hides the page too. The boundary only remounts when `history.state` changed while the page was hidden, so a fallback never wipes the page, nor the update that suspended.
- **No `onBlur` from a hidden page.** The focused element inside the page is blurred as the page is hidden, while React ignores the event. Otherwise an `onBlur` handler could run from the hidden page, after the navigation started, and submit or navigate (hijacking the navigation). The trade-off: a blur-based autosave does not run on leave. Save on an explicit signal instead (a button, a debounced change, or `useFormAction`'s `onLeave`).

## When to use `restore`

For pages users leave to look at something and come back to with Back: a list with filters or a scroll position, then a detail page, then Back. A link or a `router.push` to the page still gives a fresh one.

One limit: Next keeps one instance per URL, not per history entry. Back restores only the most recent instance of a URL. If the same URL was pushed again in between (list → detail → link to the list → detail → Back, Back), the older entry comes back fresh.

## When to use `keep`

For hubs where any return should restore everything: a dashboard with tabs and panels the user arranged, a workspace with several drafts. Two cases where `keep` surprises:

- An intercepted modal route (`@modal/(.)photo/[id]`) on `keep` shows the old modal, draft included, when the user opens it again by link. Keep those `fresh`.
- A switch of a root param, such as a `[locale]` segment, keeps the old locale's whole tree alive. With `keep`, switching back shows the old tree and its state.

## Layouts and nesting

A layout's policy applies when the layout itself is hidden, that is, when the user leaves its segment. Navigating between pages inside a layout never hides the layout.

Policies nest: when the user leaves a `fresh` layout, everything below it is remounted with it, including the pages kept inside it. A `restore` or `keep` page under a `fresh` layout only restores across navigations that stay inside that layout. Give the layout `restore` or `keep` too when its pages must survive leaving it.

### Root layouts

A root layout, one whose output is `<html>` (possibly under providers), is never wrapped, whatever its `visits` says. `app/layout.tsx` is never hidden, so a boundary there would never fire. A root layout below a dynamic segment (`app/[locale]/layout.tsx`) is hidden when that param changes, and remounting it would recreate the document's `<html>` and `<body>`. The pages and layouts below it are hidden along with it and apply their own policies, so nothing is lost by leaving the root alone.

## What a visit policy cannot cover

The boundary resets the React subtree of the page or layout it wraps. It cannot reach:

- **State above it**: a layout on `keep`, a provider in the root layout, a context value. Reset it where it lives.
- **External stores**: a client cache, a global store, `localStorage`. The remounted page reads them again as they are.
- **Unmatched parallel slots**: a slot whose route did not change (`@panel` rendering its `default.tsx`) is never hidden on a sibling navigation, so its boundary never fires. If it must reset per navigation, key it yourself, for example on `usePathname()`.
- **Uncontrolled inputs fed from the URL**: a page remounted while hidden renders with the props it had when it was hidden, and new props arrive after. An `<input defaultValue={q}>` can come back showing the old `q`. Key it on its value: `<input key={q} defaultValue={q} />`.
- **Templates**: `template.tsx` no longer remounts on navigation either, because it renders inside the segment's `<Activity>`. Use the page's or layout's policy instead.

## Forms

A form action needs a deliberate leave behaviour, whatever the page's policy. Use [`useFormAction`](client.md#useformaction) for `formActionPipe` actions: its callbacks run once per result (never again on a return), every field is kept after an error, and `onLeave` clears the result or the whole form when the page is hidden. On a `fresh` page the default `onLeave: "keep"` is enough, since the page itself resets; on `restore` and `keep` pages, choose `"clearResult"` or `"reset"`. See [formActionPipe](form-action-pipe.md#leaving-the-page).

## Testing

**End-to-end**: hidden routes stay in the document with `display: none`. Query by role or label (Playwright's `getByRole` and `getByLabel` skip hidden elements) or filter by visibility. See [Next's guide](https://nextjs.org/docs/app/guides/preserving-ui-state#testing).

**Components** (Vitest or Jest with jsdom and Testing Library): render the component inside `<Activity>` and switch its `mode`. Wrapping it in `<StrictMode>` reproduces `next dev`, where React re-runs layout effects when the tree is shown again. A helper like this one is enough:

```tsx
import { act, render } from "@testing-library/react";
import { Activity, StrictMode, startTransition, type ReactNode } from "react";

export function renderInActivity(ui: ReactNode, { isStrictMode = false } = {}) {
  let isVisible = true;
  const tree = () => {
    const activity = (
      <Activity mode={isVisible ? "visible" : "hidden"}>{ui}</Activity>
    );
    return isStrictMode ? <StrictMode>{activity}</StrictMode> : activity;
  };
  const view = render(tree());
  const setVisible = (visible: boolean, { isTransition = false } = {}) => {
    isVisible = visible;
    return act(async () => {
      if (isTransition) startTransition(() => view.rerender(tree()));
      else view.rerender(tree());
    });
  };
  return {
    hide: (options?: { isTransition?: boolean }) => setVisible(false, options),
    show: (options?: { isTransition?: boolean }) => setVisible(true, options),
  };
}
```

Pass `isTransition` to hide the way a navigation does. Two things to know when testing forms with it:

- A transition cannot hide a tree while one of its form actions is pending: React waits for the action to settle first. A plain (non-transition) hide goes through.
- A tree hidden while an action is pending cannot be shown again until the action settles. A result therefore always arrives while the form is hidden, never after it is shown.

To test a `fresh` page's reset, change `history.state` before hiding it (`history.pushState({}, "")`), as a navigation does. Without that, the boundary treats the hide as a Suspense fallback and keeps the page.

## See also

- [pagePipe](page-pipe.md) · [layoutPipe](layout-pipe.md) · [formActionPipe](form-action-pipe.md) · [Client & hooks](client.md#useformaction)
- Next.js: [Preserving UI state](https://nextjs.org/docs/app/guides/preserving-ui-state)
