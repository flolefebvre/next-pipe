/**
 * Pages, resolved through the built `dist`.
 */

import z from "zod";
import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import { pagePipe } from "@flefebvre/next-pipe/pipes";
import type { VisitOptions, VisitPolicy } from "@flefebvre/next-pipe/pipes";
import { SearchParamsMiddleware } from "@flefebvre/next-pipe/middlewares/pages";

const Page = pagePipe<{ searchParams: Promise<{ q?: string }> }>()
  .use(SearchParamsMiddleware, z.object({ q: z.string().optional() }))
  .handle(async (arg) => {
    type SearchParamsAreNotAny = Expect<Not<IsAny<(typeof arg)["query"]>>>;
    type SearchParamsAreTyped = Expect<IsEqual<(typeof arg)["query"], { q?: string | undefined }>>;
    return arg.query.q ?? "none";
  });

// The props argument is required — a zero-argument call must not typecheck,
// even for a no-generic page (Next itself always supplies the props object).
type PagePropsAreRequired = Expect<IsEqual<Parameters<typeof Page>["length"], 1>>;

const BarePage = pagePipe().handle(async () => "bare");
type BarePagePropsAreRequired = Expect<IsEqual<Parameters<typeof BarePage>["length"], 1>>;

/* --- visit policies --- */

type VisitPolicyIsTyped = Expect<IsEqual<VisitPolicy, "fresh" | "restore" | "keep">>;
type VisitOptionsAreTyped = Expect<IsEqual<VisitOptions, { visits?: VisitPolicy }>>;

const RestoredPage = pagePipe<{ params: Promise<{ id: string }> }>({ visits: "restore" }).handle(
  async (arg) => {
    type PageParamsSurviveTheOption = Expect<
      IsEqual<Awaited<(typeof arg)["params"]>, { id: string }>
    >;
    return (await arg.params).id;
  },
);

type PageOutputIsReactNode = Expect<
  IsEqual<Awaited<ReturnType<typeof RestoredPage>>, Awaited<React.ReactNode>>
>;

// @ts-expect-error "remember" is not a visit policy
pagePipe({ visits: "remember" });

export { Page, BarePage, RestoredPage };
