import { error, interrupt, Middleware, next, type ActionResult } from "../../core.js";
import * as z from "zod";

export class InputValidationMiddleware<TSchema extends z.ZodType> extends Middleware<ActionResult> {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { input: unknown }) {
    const parse = this.schema.safeParse(arg.input);
    if (!parse.success) {
      // Annotate against zod's *exported* alias, unwrapped: `flattenError`
      // returns the non-exported `_FlattenedError`, which emit inlines — and
      // the inlined body loses the binding for `U`. `Simplify` re-inlines it (#8).
      const errors: z.core.$ZodFlattenedError<z.core.output<TSchema>> = z.flattenError(parse.error);
      return interrupt(error("schema", errors));
    }
    return next({ input: parse.data });
  }

  async after(t: this["After"]) {
    return t;
  }
}
