import type { Simplify } from "type-fest";
import { error, interrupt, merge, Middleware, next, type ActionResult } from "../../core.js";
import z from "zod";

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
      const zodError = z.flattenError(parse.error);
      return interrupt({
        input: this.parsedPartial(),
        ...error("schema", zodError as Simplify<typeof zodError>),
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
