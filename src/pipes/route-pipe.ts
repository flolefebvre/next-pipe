import { entry, Pipe } from "../core.js";
import { ResponseMiddleware } from "../middlewares/routes/response-middleware.js";

function routePipe<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Context extends { params: Promise<Record<string, unknown>> } = { params: Promise<{}> },
>() {
  return new Pipe(entry((req: Request, ctx: Context) => ({ req, ctx }))).use(ResponseMiddleware);
}

export { routePipe };
