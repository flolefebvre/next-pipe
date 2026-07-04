import type { Simplify } from "type-fest";
import { BeforeMiddleware, error, interrupt, next, type MiddlewareConfig } from "../../core.js";
import z from "zod";

export class BodyValidationMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { req: Request }) {
    const body = await arg.req.json();
    const parse = this.schema.safeParse(body);
    if (!parse.success) {
      const zodError = z.flattenError(parse.error);
      return interrupt({
        status: 400,
        json: error("schema", zodError as Simplify<typeof zodError>),
      } as const);
    }
    return next({ input: parse.data });
  }

  declare config: MiddlewareConfig<"schema", z.infer<TSchema>>;
}
