import { error, interrupt, merge, Middleware, next, type ActionResult } from "../../core.js";
import * as z from "zod";

/**
 * Which results carry the echo:
 * - `"onError"` (the default): error results only, so a success with no
 *   redirect leaves nothing to refill the form with and it clears;
 * - `"always"`: every result, success included (the 2.x behaviour).
 */
type FormEcho = "always" | "onError";

type SchemaKey<TSchema extends z.ZodObject> = keyof TSchema["shape"] & string;

type FormValidationOptions<
  TSchema extends z.ZodObject,
  TEcho extends FormEcho,
  TOmit extends SchemaKey<TSchema>,
> = {
  /** Which results carry the echoed input. Defaults to `"onError"`. */
  echo?: TEcho;
  /** Schema keys never echoed back, such as passwords. */
  omit?: readonly TOmit[];
};

/**
 * The `input` echoed onto results: the raw submitted string for each schema
 * key not omitted, meant to refill a form via `defaultValue`. Never parsed.
 */
type FormInputEcho<TSchema extends z.ZodObject, TOmit extends SchemaKey<TSchema>> = {
  [K in Exclude<keyof TSchema["shape"], TOmit>]?: string;
};

/** Merges the echo into the results `echo` selects, member by member. */
type WithEcho<T, TEcho extends FormEcho, TInput> = T extends unknown
  ? TEcho extends "always"
    ? ReturnType<typeof merge<T, { input: TInput }>>
    : T extends { status: "error" }
      ? ReturnType<typeof merge<T, { input: TInput }>>
      : T
  : never;

export class FormValidationMiddleware<
  TSchema extends z.ZodObject,
  TEcho extends FormEcho = "onError",
  TOmit extends SchemaKey<TSchema> = never,
> extends Middleware<ActionResult> {
  private input?: Record<string, unknown>;
  constructor(
    private schema: TSchema,
    private options: FormValidationOptions<TSchema, TEcho, TOmit> = {},
  ) {
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
    const isEchoed = this.options.echo === "always" || t.status === "error";
    return (isEchoed ? merge(t, { input: this.rawEcho() }) : t) as WithEcho<
      this["After"],
      TEcho,
      FormInputEcho<TSchema, TOmit>
    >;
  }

  /** The submitted strings for the schema's keys; files, missing and omitted keys are left out. */
  private rawEcho(): FormInputEcho<TSchema, TOmit> {
    const input = this.input ?? {};
    const omitted: readonly string[] = this.options.omit ?? [];
    const echo: Record<string, string> = {};
    for (const key of Object.keys(this.schema.shape)) {
      const value = input[key];
      if (typeof value === "string" && !omitted.includes(key)) echo[key] = value;
    }
    return echo as FormInputEcho<TSchema, TOmit>;
  }
}

export type { FormEcho, FormValidationOptions };
