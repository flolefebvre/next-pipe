import { BeforeMiddleware, next, type MiddlewareConfig } from "../../core.js";
import { validateSchema } from "./validate-schema.js";
import * as z from "zod";

export class QuerystringMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { req: Request }) {
    const searchParams = new URL(arg.req.url).searchParams;
    const parsed = validateSchema(this.schema, "querystring", Object.fromEntries(searchParams));
    if (!parsed.ok) return parsed.interrupted;
    return next({ query: parsed.data });
  }

  declare config: MiddlewareConfig<"querystring", z.infer<TSchema>>;
}
