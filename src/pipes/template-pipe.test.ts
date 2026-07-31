import { expect, test } from "vitest";
import { BeforeMiddleware, next } from "../core.js";
import { templatePipe } from "./template-pipe.js";

test("passes the handler's ReactNode through unchanged", async () => {
  const handler = templatePipe().handle(async ({ children }) => children);

  await expect(handler({ children: "the child tree" })).resolves.toBe("the child tree");
});

test("middlewares compose in front of the template", async () => {
  class ThemeMiddleware extends BeforeMiddleware {
    async before() {
      return next({ theme: "dark" });
    }
  }

  const handler = templatePipe()
    .use(ThemeMiddleware)
    .handle(async ({ theme, children }) => `${theme}: ${String(children)}`);

  await expect(handler({ children: "child" })).resolves.toBe("dark: child");
});
