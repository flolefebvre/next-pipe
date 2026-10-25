import { entry, Pipe } from "../core.js";
import { OutputTypeMiddleware } from "../middlewares/output-type-middleware.js";
import { VisitMiddleware, type VisitOptions } from "../middlewares/pages/visit-middleware.js";

type LayoutPropsShape = {
  children: React.ReactNode;
  params?: Promise<unknown>;
  // Next never passes searchParams to layouts (they don't re-render on
  // navigation, so it would be stale) — reject it at the pipe.
  searchParams?: never;
};

/**
 * Pass Next's generated `LayoutProps<"/route">` as the generic to receive
 * typed `children`/`params` — and any parallel-route slots — in the handler
 * input (and let middlewares depend on them). Without a generic the input
 * holds `children` only.
 *
 * `visits` sets what a return to the layout looks like (default `"fresh"`). A
 * root layout, one that renders `<html>`, is never wrapped; see
 * `docs/activity.md`.
 */
function layoutPipe<Props extends LayoutPropsShape = { children: React.ReactNode }>({
  visits = "fresh",
}: VisitOptions = {}) {
  return new Pipe(entry((props: Props) => ({ ...props })))
    .use(OutputTypeMiddleware<React.ReactNode>)
    .use(VisitMiddleware, visits);
}

export { layoutPipe };
