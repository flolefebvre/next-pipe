import { BeforeMiddleware, next, type MiddlewareConfig } from "../../core.js";
import { validateSchema } from "./validate-schema.js";
import * as z from "zod";

export class BodyValidationMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { req: Request }) {
    const parsed = validateSchema(this.schema, "schema", await arg.req.json());
    if (!parsed.ok) return parsed.interrupted;
    return next({ input: parsed.data });
  }

  declare config: MiddlewareConfig<"schema", z.infer<TSchema>>;
}
