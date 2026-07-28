import { BeforeMiddleware, error, interrupt, next, type MiddlewareConfig } from "../../core.js";
import * as z from "zod";

export class QuerystringMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { req: Request }) {
    const searchParams = new URL(arg.req.url).searchParams;
    const query = Object.fromEntries(searchParams);
    const parse = this.schema.safeParse(query);
    if (!parse.success) {
      // Named against zod's *exported* alias. `flattenError` is declared as
      // returning the non-exported `_FlattenedError`, which emit cannot name:
      // it inlines the body, losing `U`'s binding. `Simplify` re-inlines it (#8).
      const zodError: z.core.$ZodFlattenedError<z.core.output<TSchema>> = z.flattenError(
        parse.error,
      );
      return interrupt({
        status: 400,
        json: error("querystring", zodError),
      } as const);
    }
    return next({ query: parse.data });
  }

  declare config: MiddlewareConfig<"querystring", z.infer<TSchema>>;
}
