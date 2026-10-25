import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Activity, StrictMode, Suspense, use, useId, useLayoutEffect, useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { deferred } from "../tests/deferred.js";
import { renderInActivity } from "../tests/render-in-activity.js";
import { RouterStub } from "../tests/next-router-stub.js";
import { FreshBoundary, RestoreBoundary } from "./visit-boundary.js";

vi.mock("next/navigation.js", async () => ({
  useRouter: (await import("../tests/next-router-stub.js")).useRouterStub,
}));

let mountedInstances: string[] = [];

function Draft({ onBlur }: { onBlur?: () => void }) {
  const instance = useId();
  useLayoutEffect(() => {
    if (!mountedInstances.includes(instance)) mountedInstances.push(instance);
  }, [instance]);

  return (
    <label>
      Draft
      <input name="draft" onBlur={onBlur} />
    </label>
  );
}

function draftField() {
  return screen.getByLabelText<HTMLInputElement>("Draft");
}

async function typeDraft(text: string) {
  await userEvent.setup().type(draftField(), text);
}

let historyEntry = 0;

function navigate() {
  historyEntry += 1;
  window.history.pushState({ entry: historyEntry }, "");
}

beforeEach(() => {
  mountedInstances = [];
});

describe.each([false, true])("fresh (StrictMode: %s)", (isStrictMode) => {
  function renderFresh(onBlur?: () => void) {
    return renderInActivity(
      <FreshBoundary>
        <Draft onBlur={onBlur} />
      </FreshBoundary>,
      { isStrictMode },
    );
  }

  test("a return after a navigation remounts the page exactly once", async () => {
    const view = renderFresh();
    await typeDraft("unsaved");

    navigate();
    await view.hide({ isTransition: true });
    await view.show({ isTransition: true });

    expect(draftField().value).toBe("");
    expect(mountedInstances).toHaveLength(2);
  });

  test("the first mount does not remount", async () => {
    renderFresh();

    await act(async () => {});

    expect(mountedInstances).toHaveLength(1);
  });

  test("a hide without a navigation keeps the page", async () => {
    const view = renderFresh();
    await typeDraft("unsaved");

    await view.hide();
    await view.show();

    expect(draftField().value).toBe("unsaved");
    expect(mountedInstances).toHaveLength(1);
  });

  test("blurs the focused field on hide, without running its onBlur", async () => {
    const onBlur = vi.fn();
    const view = renderFresh(onBlur);
    await userEvent.setup().click(draftField());

    await view.hide();

    expect(document.activeElement).toBe(document.body);
    expect(onBlur).not.toHaveBeenCalled();
  });

  test("a page shown again in the same task is not remounted", async () => {
    function page(mode: "visible" | "hidden") {
      const activity = (
        <Activity mode={mode}>
          <FreshBoundary>
            <Draft />
          </FreshBoundary>
        </Activity>
      );
      return isStrictMode ? <StrictMode>{activity}</StrictMode> : activity;
    }
    const view = render(page("visible"));
    await typeDraft("unsaved");

    navigate();
    view.rerender(page("hidden"));
    view.rerender(page("visible"));
    await act(async () => {});

    expect(draftField().value).toBe("unsaved");
    expect(mountedInstances).toHaveLength(1);
  });

  test("an urgent update that suspends above it keeps the page and the update", async () => {
    const { promise: loaded, resolve: finishLoading } = deferred<string>();

    function Loader() {
      const [request, setRequest] = useState<Promise<string> | null>(null);
      return (
        <>
          <p>{request ? use(request) : "idle"}</p>
          <button onClick={() => setRequest(loaded)}>Load</button>
        </>
      );
    }

    renderInActivity(
      <Suspense fallback={<p>Loading</p>}>
        <FreshBoundary>
          <Loader />
          <Draft />
        </FreshBoundary>
      </Suspense>,
      { isStrictMode },
    );
    await typeDraft("unsaved");

    await act(async () => screen.getByRole("button", { name: "Load" }).click());
    await screen.findByText("Loading");
    await act(async () => finishLoading("loaded"));

    expect(await screen.findByText("loaded")).toBeTruthy();
    expect(draftField().value).toBe("unsaved");
    expect(mountedInstances).toHaveLength(1);
  });
});

describe.each([false, true])("restore (StrictMode: %s)", (isStrictMode) => {
  function page(bfcacheId: string) {
    return (
      <RouterStub bfcacheId={bfcacheId}>
        <RestoreBoundary>
          <Draft />
        </RestoreBoundary>
      </RouterStub>
    );
  }

  test("back/forward restores the page", async () => {
    const view = renderInActivity(page("_b_1_"), { isStrictMode });
    await typeDraft("unsaved");

    await view.hide({ isTransition: true });
    await view.show({ isTransition: true });

    expect(draftField().value).toBe("unsaved");
  });

  test("a push or replace gives a fresh page", async () => {
    const view = renderInActivity(page("_b_1_"), { isStrictMode });
    await typeDraft("unsaved");

    await view.hide({ isTransition: true });
    await view.rerender(page("_b_2_"));
    await view.show({ isTransition: true });

    expect(draftField().value).toBe("");
  });
});
