import { act, render } from "@testing-library/react";
import { Activity, StrictMode, startTransition, type ReactNode } from "react";

type ModeChangeOptions = {
  /** Switch inside `startTransition`, as a Next navigation does. */
  isTransition?: boolean;
};

/**
 * Renders `ui` inside `<Activity>` and lets a test hide and show it, the way
 * Next hides a route it keeps alive. `isStrictMode` reproduces next dev, where
 * React runs an extra layout effect cleanup and setup when the tree is shown
 * again. Each mode change flushes microtasks before it returns.
 */
export function renderInActivity(
  initialUi: ReactNode,
  { isStrictMode = false }: { isStrictMode?: boolean } = {},
) {
  let ui = initialUi;
  let isVisible = true;

  function tree() {
    const activity = <Activity mode={isVisible ? "visible" : "hidden"}>{ui}</Activity>;
    return isStrictMode ? <StrictMode>{activity}</StrictMode> : activity;
  }

  const view = render(tree());

  async function update({ isTransition = false }: ModeChangeOptions) {
    await act(async () => {
      if (isTransition) startTransition(() => view.rerender(tree()));
      else view.rerender(tree());
    });
  }

  return {
    hide: (options: ModeChangeOptions = {}) => {
      isVisible = false;
      return update(options);
    },
    show: (options: ModeChangeOptions = {}) => {
      isVisible = true;
      return update(options);
    },
    rerender: (nextUi: ReactNode) => {
      ui = nextUi;
      return update({});
    },
  };
}
