import type { Simplify } from "type-fest";
import { BeforeMiddleware, error, interrupt, next, type MiddlewareConfig } from "../../core.js";
import z from "zod";

export class QuerystringMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { req: Request }) {
    const searchParams = new URL(arg.req.url).searchParams;
    const query = Object.fromEntries(searchParams);
    const parse = this.schema.safeParse(query);
    if (!parse.success) {
      const zodError = z.flattenError(parse.error);
      return interrupt({
        status: 400,
        json: error("querystring", zodError as Simplify<typeof zodError>),
      } as const);
    }
    return next({ query: parse.data });
  }

  declare config: MiddlewareConfig<"querystring", z.infer<TSchema>>;
}
