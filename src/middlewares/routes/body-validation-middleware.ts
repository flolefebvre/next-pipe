import { BeforeMiddleware, error, interrupt, next, type MiddlewareConfig } from "../../core.js";
import * as z from "zod";

export class BodyValidationMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { req: Request }) {
    const body = await arg.req.json();
    const parse = this.schema.safeParse(body);
    if (!parse.success) {
      // Annotate against zod's *exported* alias, unwrapped: `flattenError`
      // returns the non-exported `_FlattenedError`, which emit inlines — and
      // the inlined body loses the binding for `U`. Do not wrap it: `Simplify`
      // re-expands the annotation and loses `U` again (#8).
      const zodError: z.core.$ZodFlattenedError<z.core.output<TSchema>> = z.flattenError(
        parse.error,
      );
      return interrupt({
        status: 400,
        json: error("schema", zodError),
      } as const);
    }
    return next({ input: parse.data });
  }

  declare config: MiddlewareConfig<"schema", z.infer<TSchema>>;
}
