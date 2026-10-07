import { error, interrupt, merge, Middleware, next, type ActionResult } from "../../core.js";
import * as z from "zod";

/**
 * The `input` echoed onto results: the raw submitted string for each schema
 * key, meant to refill a form via `defaultValue`. Never parsed.
 */
type FormInputEcho<TSchema extends z.ZodObject> = {
  [K in keyof TSchema["shape"]]?: string;
};

export class FormValidationMiddleware<
  TSchema extends z.ZodObject,
> extends Middleware<ActionResult> {
  private input?: Record<string, unknown>;
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { input: Record<string, unknown> }) {
    this.input = arg.input;
    const parse = this.schema.safeParse(arg.input);
    if (!parse.success) {
      // Annotate against zod's *exported* alias, unwrapped: `flattenError`
      // returns the non-exported `_FlattenedError`, which emit inlines — and
      // the inlined body loses the binding for `U`. Do not wrap it: `Simplify`
      // re-expands the annotation and loses `U` again (#8).
      const zodError: z.core.$ZodFlattenedError<z.core.output<TSchema>> = z.flattenError(
        parse.error,
      );
      return interrupt({
        input: this.rawEcho(),
        ...error("schema", zodError),
      });
    }
    return next({ input: parse.data });
  }

  async after(t: this["After"]) {
    return merge(t, { input: this.rawEcho() });
  }

  /** The submitted strings for the schema's keys; files and missing keys are omitted. */
  private rawEcho(): FormInputEcho<TSchema> {
    const input = this.input ?? {};
    const echo: Record<string, string> = {};
    for (const key of Object.keys(this.schema.shape)) {
      const value = input[key];
      if (typeof value === "string") echo[key] = value;
    }
    return echo as FormInputEcho<TSchema>;
  }
}
