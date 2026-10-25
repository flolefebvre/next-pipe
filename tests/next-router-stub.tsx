import { createContext, useContext, type ReactNode } from "react";

const BfcacheIdContext = createContext("_b_0_");

/**
 * Stands in for `next/navigation`'s `useRouter` in jsdom tests. Its consumer
 * is a `vi.mock` factory, whose dynamic import fallow does not follow.
 */
// fallow-ignore-next-line unused-export
export function useRouterStub() {
  return { bfcacheId: useContext(BfcacheIdContext) };
}

/** Provides the `bfcacheId` that `useRouterStub` returns below it. */
export function RouterStub({ bfcacheId, children }: { bfcacheId: string; children: ReactNode }) {
  return <BfcacheIdContext value={bfcacheId}>{children}</BfcacheIdContext>;
}
