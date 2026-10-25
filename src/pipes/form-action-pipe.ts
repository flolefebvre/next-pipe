import type * as z from "zod";
import {
  FormValidationMiddleware,
  type FormEcho,
  type FormValidationOptions,
} from "../middlewares/form-actions/form-validation-middleware.js";
import { entry, Pipe, type ActionResult } from "../core.js";
import { OutputTypeMiddleware } from "../middlewares/output-type-middleware.js";

function formActionPipe(): ReturnType<typeof formActionNoSchema>;
function formActionPipe<
  TSchema extends z.ZodObject,
  TEcho extends FormEcho = "onError",
  TOmit extends keyof TSchema["shape"] & string = never,
>(
  schema: TSchema,
  options?: FormValidationOptions<TSchema, TEcho, TOmit>,
): ReturnType<typeof formActionWithSchema<TSchema, TEcho, TOmit>>;
function formActionPipe<TSchema extends z.ZodObject | undefined>(
  schema?: TSchema,
  options?: FormValidationOptions<z.ZodObject, FormEcho, string>,
) {
  if (schema === undefined) {
    return formActionNoSchema();
  }
  return formActionWithSchema(schema, options);
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

function formActionWithSchema<
  TSchema extends z.ZodObject,
  TEcho extends FormEcho = "onError",
  TOmit extends keyof TSchema["shape"] & string = never,
>(schema: TSchema, options: FormValidationOptions<TSchema, TEcho, TOmit> = {}) {
  return formActionEntry().use(FormValidationMiddleware<TSchema, TEcho, TOmit>, schema, options);
}

export { formActionPipe };
