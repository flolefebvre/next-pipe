/**
 * Pages, resolved through the built `dist`.
 */

import z from "zod";
import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import { pagePipe } from "@flefebvre/next-pipe/pipes";
import { SearchParamsMiddleware } from "@flefebvre/next-pipe/middlewares/pages";

const Page = pagePipe<{ searchParams: Promise<{ q?: string }> }>()
  .use(SearchParamsMiddleware, z.object({ q: z.string().optional() }))
  .handle(async (arg) => {
    type SearchParamsAreNotAny = Expect<Not<IsAny<(typeof arg)["query"]>>>;
    type SearchParamsAreTyped = Expect<IsEqual<(typeof arg)["query"], { q?: string | undefined }>>;
    return arg.query.q ?? "none";
  });

export { Page };
