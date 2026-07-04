import { expect, test } from "vitest";
import z from "zod";
import { pagePipe } from "../../pipes/page-pipe.js";
import { SearchParamsMiddleware } from "./search-params-middleware.js";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const schema = z.object({
  q: z.string(),
  page: z.coerce.number().catch(1),
});

const handler = pagePipe<Props>()
  .use(SearchParamsMiddleware, schema)
  .handle(async ({ query }) => `q=${query.q} page=${query.page}`);

test("merges the parsed query into the handler's input", async () => {
  await expect(handler({ searchParams: Promise.resolve({ q: "hello", page: "3" }) })).resolves.toBe(
    "q=hello page=3",
  );
});

test("schema fallbacks apply instead of failing", async () => {
  await expect(
    handler({ searchParams: Promise.resolve({ q: "hello", page: "not-a-number" }) }),
  ).resolves.toBe("q=hello page=1");
});

test("a query failing the schema renders the 404 page", async () => {
  const thrown = await handler({ searchParams: Promise.resolve({}) }).then(
    () => null,
    (err: unknown) => err,
  );
  expect((thrown as { digest?: string })?.digest).toContain("404");
});
