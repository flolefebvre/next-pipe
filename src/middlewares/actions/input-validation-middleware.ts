import { error, interrupt, Middleware, next, type ActionResult } from "../../core.js";
import z from "zod";

export class InputValidationMiddleware<TSchema extends z.ZodType> extends Middleware<ActionResult> {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { input: unknown }) {
    const parse = this.schema.safeParse(arg.input);
    if (!parse.success) {
      const errors = z.flattenError(parse.error);
      return interrupt(error("schema", errors));
    }
    return next({ input: parse.data });
  }

  async after(t: this["After"]) {
    return t;
  }
}
