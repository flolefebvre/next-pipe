import { entry, Pipe } from "../core.js";
import { OutputTypeMiddleware } from "../middlewares/output-type-middleware.js";
import { VisitMiddleware, type VisitOptions } from "../middlewares/pages/visit-middleware.js";

type PagePropsShape = {
  params?: Promise<unknown>;
  searchParams?: Promise<unknown>;
};

/**
 * Pass Next's generated `PageProps<"/route">` as the generic to receive typed
 * `params`/`searchParams` in the handler input (and let middlewares depend on
 * them). Without a generic the input starts empty, as before.
 *
 * `visits` sets what a return to the page looks like (default `"fresh"`); see
 * `docs/activity.md`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
function pagePipe<Props extends PagePropsShape = {}>({ visits = "fresh" }: VisitOptions = {}) {
  return new Pipe(entry((props: Props) => ({ ...props })))
    .use(OutputTypeMiddleware<React.ReactNode>)
    .use(VisitMiddleware, visits);
}

export { pagePipe };
