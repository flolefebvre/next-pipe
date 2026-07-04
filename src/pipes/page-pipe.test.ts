import { expect, test } from "vitest";
import { BeforeMiddleware, next } from "../core.js";
import { pagePipe } from "./page-pipe.js";

test("passes the handler's ReactNode through unchanged", async () => {
  const handler = pagePipe().handle(async () => "the page");

  await expect(handler()).resolves.toBe("the page");
});

test("threads typed params and searchParams into the handler", async () => {
  type Props = {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ q?: string }>;
  };

  const handler = pagePipe<Props>().handle(async ({ params, searchParams }) => {
    const { id } = await params;
    const { q } = await searchParams;
    return `page ${id} ${q ?? "-"}`;
  });

  await expect(
    handler({
      params: Promise.resolve({ id: "42" }),
      searchParams: Promise.resolve({ q: "x" }),
    }),
  ).resolves.toBe("page 42 x");
});

test("middlewares can depend on page params", async () => {
  type Props = { params: Promise<{ id: string }> };

  class LoadMiddleware extends BeforeMiddleware {
    async before(arg: { params: Promise<{ id: string }> }) {
      const { id } = await arg.params;
      return next({ entity: `entity-${id}` });
    }
  }

  const handler = pagePipe<Props>()
    .use(LoadMiddleware)
    .handle(async ({ entity }) => entity);

  await expect(handler({ params: Promise.resolve({ id: "7" }) })).resolves.toBe("entity-7");
});
