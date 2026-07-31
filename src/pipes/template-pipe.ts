import { entry, Pipe } from "../core.js";
import { OutputTypeMiddleware } from "../middlewares/output-type-middleware.js";

type TemplatePropsShape = {
  children: React.ReactNode;
  // Next passes templates a keyed `children` and nothing else — reject the
  // props layouts and pages get.
  params?: never;
  searchParams?: never;
};

/**
 * The `template.tsx` twin of `layoutPipe`: identical mechanics, but the
 * constraint also rejects `params`, which templates never receive.
 */
function templatePipe<Props extends TemplatePropsShape = { children: React.ReactNode }>() {
  return new Pipe(entry((props: Props) => ({ ...props }))).use(
    OutputTypeMiddleware<React.ReactNode>,
  );
}

export { templatePipe };
