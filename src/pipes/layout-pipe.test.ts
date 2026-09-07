import { expect, test } from "vitest";
import {
  expectThemedRender,
  LoadEntityMiddleware,
  ThemeMiddleware,
} from "../../tests/unit-fixtures.js";
import { layoutPipe } from "./layout-pipe.js";

test("passes the handler's ReactNode through unchanged", async () => {
  const handler = layoutPipe().handle(async ({ children }) => children);

  await expect(handler({ children: "the child tree" })).resolves.toBe("the child tree");
});

test("composes middlewares without a generic argument", async () => {
  const handler = layoutPipe()
    .use(ThemeMiddleware)
    .handle(async ({ theme, children }) => `${theme}: ${String(children)}`);

  await expectThemedRender(handler);
});

test("threads typed children, params, and slots into the handler", async () => {
  type Props = {
    children: React.ReactNode;
    params: Promise<{ team: string }>;
    modal: React.ReactNode;
  };

  const handler = layoutPipe<Props>().handle(async ({ children, params, modal }) => {
    const { team } = await params;
    return `${String(children)} ${team} ${String(modal)}`;
  });

  await expect(
    handler({
      children: "child",
      params: Promise.resolve({ team: "acme" }),
      modal: "modal",
    }),
  ).resolves.toBe("child acme modal");
});

test("middlewares can depend on layout params", async () => {
  type Props = { children: React.ReactNode; params: Promise<{ id: string }> };

  const handler = layoutPipe<Props>()
    .use(LoadEntityMiddleware)
    .handle(async ({ entity, children }) => `${entity} wraps ${String(children)}`);

  await expect(handler({ children: "child", params: Promise.resolve({ id: "7" }) })).resolves.toBe(
    "entity-7 wraps child",
  );
});
