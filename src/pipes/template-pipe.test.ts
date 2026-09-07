import { expect, test } from "vitest";
import { expectThemedRender, ThemeMiddleware } from "../../tests/unit-fixtures.js";
import { templatePipe } from "./template-pipe.js";

test("passes the handler's ReactNode through unchanged", async () => {
  const handler = templatePipe().handle(async ({ children }) => children);

  await expect(handler({ children: "the child tree" })).resolves.toBe("the child tree");
});

test("middlewares compose in front of the template", async () => {
  const handler = templatePipe()
    .use(ThemeMiddleware)
    .handle(async ({ theme, children }) => `${theme}: ${String(children)}`);

  await expectThemedRender(handler);
});
