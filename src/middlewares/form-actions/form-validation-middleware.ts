import { error, interrupt, merge, Middleware, next, type ActionResult } from "../../core.js";
import * as z from "zod";

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
        input: this.parsedPartial(),
        ...error("schema", zodError),
      });
    }
    return next({ input: parse.data });
  }

  async after(t: this["After"]) {
    return merge(t, { input: this.parsedPartial() });
  }

  private parsedPartial() {
    const schema = this.partial<TSchema["shape"]>(this.schema);
    return schema.parse(this.input);
  }

  private partial<T extends Readonly<{ [k: string]: z.ZodType }>>(
    schema: z.ZodObject<T, z.core.$strip>,
  ) {
    const entries = Object.entries(schema.shape).map(([k, v]) => [
      k,
      v.optional().catch(undefined),
    ]);
    const obj = Object.fromEntries(entries) as {
      [K in keyof T]: z.ZodCatch<z.ZodOptional<T[K]>>;
    };
    return z.object(obj);
  }
}
