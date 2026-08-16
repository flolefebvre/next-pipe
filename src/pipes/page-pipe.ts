import { entry, Pipe } from "../core.js";
import { OutputTypeMiddleware } from "../middlewares/output-type-middleware.js";

type PagePropsShape = {
  params?: Promise<unknown>;
  searchParams?: Promise<unknown>;
};

/**
 * Pass Next's generated `PageProps<"/route">` as the generic to receive typed
 * `params`/`searchParams` in the handler input (and let middlewares depend on
 * them). Without a generic the input starts empty, as before.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
function pagePipe<Props extends PagePropsShape = {}>() {
  return new Pipe(entry((props: Props) => ({ ...props }))).use(
    OutputTypeMiddleware<React.ReactNode>,
  );
}

export { pagePipe };
