/**
 * Layouts and templates, resolved through the built `dist`.
 */

import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import { layoutPipe, templatePipe } from "@flefebvre/next-pipe/pipes";

// The shape Next's generated `LayoutProps<"/route">` resolves to: required
// children, a params promise, and parallel-route slots as ReactNode props.
type GeneratedLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ team: string }>;
  modal: React.ReactNode;
};

const Layout = layoutPipe<GeneratedLayoutProps>().handle(async (arg) => {
  type ParamsAreNotAny = Expect<Not<IsAny<(typeof arg)["params"]>>>;
  type ParamsAreTyped = Expect<IsEqual<Awaited<(typeof arg)["params"]>, { team: string }>>;
  type SlotIsThreaded = Expect<IsEqual<(typeof arg)["modal"], React.ReactNode>>;
  return arg.children;
});

// Without a generic, the handler input holds `children` only.
const BareLayout = layoutPipe().handle(async (arg) => {
  type InputIsChildrenOnly = Expect<IsEqual<keyof typeof arg, "children">>;
  return arg.children;
});

const Template = templatePipe().handle(async (arg) => {
  type ChildrenIsNotAny = Expect<Not<IsAny<(typeof arg)["children"]>>>;
  return arg.children;
});

// Layouts never receive searchParams (Next 16: ALLOWED_LAYOUT_PROPS is
// ['params', 'children'] plus slots).
// @ts-expect-error searchParams is rejected by layoutPipe's constraint
layoutPipe<{ children: React.ReactNode; searchParams: Promise<{ q?: string }> }>();

// Templates receive a keyed `children` and nothing else.
// @ts-expect-error params is rejected by templatePipe's constraint
templatePipe<{ children: React.ReactNode; params: Promise<{ id: string }> }>();

// @ts-expect-error searchParams is rejected by templatePipe's constraint
templatePipe<{ children: React.ReactNode; searchParams: Promise<{ q?: string }> }>();

export { Layout, BareLayout, Template };
