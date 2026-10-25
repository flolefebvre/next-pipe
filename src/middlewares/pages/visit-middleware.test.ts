import { createElement, Fragment, isValidElement, type ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { AfterMiddleware } from "../../core.js";
import { layoutPipe } from "../../pipes/layout-pipe.js";
import { pagePipe } from "../../pipes/page-pipe.js";
import { FreshBoundary, RestoreBoundary } from "../../visit-boundary.js";
import type { VisitOptions } from "./visit-middleware.js";

function boundaryAround(output: ReactNode) {
  if (!isValidElement<{ children: ReactNode }>(output)) return null;
  return { type: output.type, children: output.props.children };
}

const renderers = {
  pagePipe: (options: VisitOptions | undefined, output: ReactNode) =>
    pagePipe(options).handle(async () => output)({}),
  layoutPipe: (options: VisitOptions | undefined, output: ReactNode) =>
    layoutPipe(options).handle(async () => output)({ children: null }),
};

describe.each(Object.entries(renderers))("%s", (_, render) => {
  test("wraps the output in the fresh boundary by default", async () => {
    expect(boundaryAround(await render(undefined, "the tree"))).toStrictEqual({
      type: FreshBoundary,
      children: "the tree",
    });
  });

  test("wraps the output in the restore boundary with visits: restore", async () => {
    expect(boundaryAround(await render({ visits: "restore" }, "the tree"))).toStrictEqual({
      type: RestoreBoundary,
      children: "the tree",
    });
  });

  test("returns the output unwrapped with visits: keep", async () => {
    await expect(render({ visits: "keep" }, "the tree")).resolves.toBe("the tree");
  });
});

test("the boundary wraps what the later middlewares' after returns", async () => {
  class SectionMiddleware extends AfterMiddleware<ReactNode> {
    async after(output: this["After"]): Promise<ReactNode> {
      return createElement("section", null, output);
    }
  }

  const output = await pagePipe()
    .use(SectionMiddleware)
    .handle(async () => "the page")({});

  const boundary = boundaryAround(output);
  expect(boundary?.type).toBe(FreshBoundary);
  expect(isValidElement(boundary?.children) && boundary.children.type).toBe("section");
});

describe("a root layout", () => {
  function Providers({ children }: { children: ReactNode }) {
    return children;
  }

  const documents = {
    "an <html> element": createElement("html", null, createElement("body")),
    "<html> under providers": createElement(
      Providers,
      null,
      createElement(Fragment, null, createElement("html", null, createElement("body"))),
    ),
    "<html> in a list of siblings": [null, createElement("html", { key: "html" })],
  };

  test.each(Object.entries(documents))("is never wrapped when it renders %s", async (_, tree) => {
    for (const visits of ["fresh", "restore"] as const) {
      const output = await layoutPipe({ visits }).handle(async () => tree)({ children: null });
      expect(output).toBe(tree);
    }
  });

  test("a layout that only nests <html> below a host element is still wrapped", async () => {
    const tree = createElement("div", null, createElement("html"));

    const output = await layoutPipe().handle(async () => tree)({ children: null });

    expect(boundaryAround(output)?.type).toBe(FreshBoundary);
  });
});
