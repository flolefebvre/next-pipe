import type z from "zod";
import { entry, Pipe, createPipe, type ActionResult } from "../core.js";
import { OutputTypeMiddleware } from "../middlewares/output-type-middleware.js";
import { InputValidationMiddleware } from "../middlewares/actions/input-validation-middleware.js";

function actionPipe(): ReturnType<typeof actionNoInput>;
function actionPipe<TSchema extends z.ZodType>(
  schema: TSchema,
): ReturnType<typeof actionWithSchema<TSchema>>;
function actionPipe<TSchema extends z.ZodType | undefined>(schema?: TSchema) {
  if (schema === undefined) {
    return actionNoInput();
  }
  return actionWithSchema(schema);
}

function actionNoInput() {
  return createPipe().use(OutputTypeMiddleware<ActionResult>);
}

function actionWithSchema<TSchema extends z.ZodType>(schema: TSchema) {
  return new Pipe(entry((input: z.infer<TSchema>) => ({ input })))
    .use(OutputTypeMiddleware<ActionResult>)
    .use(InputValidationMiddleware, schema);
}

export { actionPipe };
