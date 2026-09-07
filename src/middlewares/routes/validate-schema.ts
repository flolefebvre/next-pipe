import { error, interrupt } from "../../core.js";
import * as z from "zod";

/**
 * Internal to `src/middlewares/routes/`: shared by `BodyValidationMiddleware`
 * and `QuerystringMiddleware`, which differ only in where they read their
 * input from and under which key they report and forward it. Deliberately not
 * re-exported from `./index.js` — it is not part of the public API.
 *
 * Returns a discriminated result rather than the middleware's own `next(...)`,
 * so each middleware keeps ownership of its output key.
 */
export function validateSchema<TSchema extends z.ZodObject, TErrorKey extends string>(
  schema: TSchema,
  errorKey: TErrorKey,
  value: unknown,
) {
  const parse = schema.safeParse(value);
  if (!parse.success) {
    // Annotate against zod's *exported* alias, unwrapped: `flattenError`
    // returns the non-exported `_FlattenedError`, which emit inlines — and
    // the inlined body loses the binding for `U`. Do not wrap it: `Simplify`
    // re-expands the annotation and loses `U` again (#8).
    const zodError: z.core.$ZodFlattenedError<z.core.output<TSchema>> = z.flattenError(parse.error);
    return {
      ok: false as const,
      interrupted: interrupt({
        status: 400,
        json: error(errorKey, zodError),
      } as const),
    };
  }
  return { ok: true as const, data: parse.data };
}
