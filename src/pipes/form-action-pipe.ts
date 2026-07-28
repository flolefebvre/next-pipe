import type * as z from "zod";
import { FormValidationMiddleware } from "../middlewares/form-actions/form-validation-middleware.js";
import { entry, Pipe } from "../core.js";

function formActionPipe<TSchema extends z.ZodObject>(schema: TSchema) {
  return new Pipe(
    entry((_: unknown, form: FormData) => ({
      input: Object.fromEntries(form),
    })),
  ).use(FormValidationMiddleware, schema);
}

export { formActionPipe };
