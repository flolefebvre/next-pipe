import type * as z from "zod";
import { FormValidationMiddleware } from "../middlewares/form-actions/form-validation-middleware.js";
import { entry, Pipe, type ActionResult } from "../core.js";
import { OutputTypeMiddleware } from "../middlewares/output-type-middleware.js";

function formActionPipe(): ReturnType<typeof formActionNoSchema>;
function formActionPipe<TSchema extends z.ZodObject>(
  schema: TSchema,
): ReturnType<typeof formActionWithSchema<TSchema>>;
function formActionPipe<TSchema extends z.ZodObject | undefined>(schema?: TSchema) {
  if (schema === undefined) {
    return formActionNoSchema();
  }
  return formActionWithSchema(schema);
}

function formActionEntry() {
  return new Pipe(
    entry((_: unknown, form: FormData) => ({
      input: Object.fromEntries(form),
    })),
  );
}

function formActionNoSchema() {
  return formActionEntry().use(OutputTypeMiddleware<ActionResult>);
}

function formActionWithSchema<TSchema extends z.ZodObject>(schema: TSchema) {
  return formActionEntry().use(FormValidationMiddleware, schema);
}

export { formActionPipe };
