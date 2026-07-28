import { error, interrupt, Middleware, next, type ActionResult } from "../../core.js";
import * as z from "zod";

export class InputValidationMiddleware<TSchema extends z.ZodType> extends Middleware<ActionResult> {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { input: unknown }) {
    const parse = this.schema.safeParse(arg.input);
    if (!parse.success) {
      // Named against zod's *exported* alias. `flattenError` is declared as
      // returning the non-exported `_FlattenedError`, which emit cannot name:
      // it inlines the body, and the inlined body still references `U`, whose
      // `= string` default went with the dropped declaration. The annotation
      // must stay unwrapped — wrapping it in `Simplify` forces the same
      // structural expansion and loses `U` again (#8).
      const errors: z.core.$ZodFlattenedError<z.core.output<TSchema>> = z.flattenError(parse.error);
      return interrupt(error("schema", errors));
    }
    return next({ input: parse.data });
  }

  async after(t: this["After"]) {
    return t;
  }
}
