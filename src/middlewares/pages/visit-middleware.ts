import { createElement, isValidElement, type ReactNode } from "react";
import { AfterMiddleware } from "../../core.js";
import { FreshBoundary, RestoreBoundary } from "../../visit-boundary.js";

/**
 * What a page or layout looks like when the user comes back to it, now that
 * Next keeps visited routes alive in a hidden `<Activity>`:
 * - `fresh`: like a first visit, whether by link or by Back (the default);
 * - `restore`: fresh after a link or `router.push`/`replace`, restored on
 *   back/forward;
 * - `keep`: always restored, Next's own behaviour.
 */
type VisitPolicy = "fresh" | "restore" | "keep";

type VisitOptions = {
  /** What a return to this route looks like. Defaults to `"fresh"`. */
  visits?: VisitPolicy;
};

type ElementProps = { children?: ReactNode };

/**
 * A root layout renders `<html>`, possibly under providers. It is never
 * wrapped: see `docs/activity.md#root-layouts`. Only the chain of non-host
 * elements above the first host element is walked, which is where `<html>`
 * sits in a root layout.
 */
function rendersDocument(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(rendersDocument);
  if (!isValidElement<ElementProps>(node)) return false;
  if (typeof node.type === "string") return node.type === "html";
  return rendersDocument(node.props.children);
}

/**
 * Wraps the page or layout output in the client boundary that implements its
 * visit policy. `pagePipe` and `layoutPipe` wire it in; it is not exported.
 */
class VisitMiddleware extends AfterMiddleware<ReactNode> {
  constructor(private policy: VisitPolicy) {
    super();
  }

  async after(output: this["After"]): Promise<ReactNode> {
    if (this.policy === "keep" || rendersDocument(output)) return output;
    const boundary = this.policy === "fresh" ? FreshBoundary : RestoreBoundary;
    return createElement(boundary, { children: output });
  }
}

export { VisitMiddleware };
export type { VisitPolicy, VisitOptions };
