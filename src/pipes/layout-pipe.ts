import { entry, Pipe } from "../core.js";
import { OutputTypeMiddleware } from "../middlewares/output-type-middleware.js";

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
 */
function layoutPipe<Props extends LayoutPropsShape = { children: React.ReactNode }>() {
  // The props argument is optional so handlers stay callable with no
  // arguments in tests; Next itself always supplies it.
  return new Pipe(entry((props?: Props) => ({ ...props }) as Props)).use(
    OutputTypeMiddleware<React.ReactNode>,
  );
}

export { layoutPipe };
