"use client";

import type {} from "react-dom";
import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type FragmentInstance,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation.js";

type PendingRemount = { isCancelled: boolean };

/**
 * `fresh`: a return to the page looks like a first visit. The subtree is
 * remounted while it is hidden, so nothing stale is ever painted.
 *
 * Three guards on top of "bump a key when hidden":
 * - The bump waits for a microtask and is cancelled if the boundary is shown
 *   again first: a hide undone in the same task never remounts. StrictMode
 *   (next dev) runs an extra cleanup + setup when a tree is shown again; it
 *   must not cost a second remount.
 * - It only remounts when `history.state` changed while hidden, that is, when
 *   the hide was a navigation. A Suspense fallback above the boundary (an
 *   urgent update that suspends) hides it too, without touching history: no
 *   reset then, and the update that suspended is not thrown away.
 * - It blurs the focused element inside the boundary as it hides, while React
 *   is committing and ignores the event: an `onBlur` never runs from a hidden
 *   page (it could otherwise submit, or navigate and hijack the navigation).
 */
function FreshBoundary({ children }: { children: ReactNode }) {
  const [visit, setVisit] = useState(0);
  const fragmentRef = useRef<FragmentInstance>(null);
  const pendingRemountRef = useRef<PendingRemount | null>(null);

  useLayoutEffect(() => {
    if (pendingRemountRef.current) pendingRemountRef.current.isCancelled = true;
    const fragment = fragmentRef.current;
    const historyStateWhenShown: unknown = window.history.state;
    return () => {
      const pendingRemount = { isCancelled: false };
      pendingRemountRef.current = pendingRemount;
      fragment?.blur();
      queueMicrotask(() => {
        if (pendingRemount.isCancelled || window.history.state === historyStateWhenShown) return;
        setVisit((previousVisit) => previousVisit + 1);
      });
    };
  }, []);

  return (
    <Fragment key={visit} ref={fragmentRef}>
      {children}
    </Fragment>
  );
}

/**
 * `restore`: fresh after a push or replace, restored on back/forward.
 * `bfcacheId` is scoped to the closest route segment and only changes when a
 * push or replace creates that segment anew.
 */
function RestoreBoundary({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();

  return <Fragment key={bfcacheId}>{children}</Fragment>;
}

export { FreshBoundary, RestoreBoundary };
