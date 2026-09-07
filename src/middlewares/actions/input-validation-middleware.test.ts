import * as z from "zod";
import type { IsEqual } from "type-fest";
import {
  formPipe,
  successYo,
  testFormSubmissions,
  type Expect,
  type FormHandler,
  type NameSchemaErrorPayload,
} from "../../../tests/unit-fixtures.js";
import { InputValidationMiddleware } from "./input-validation-middleware.js";

const schema = z.object({ name: z.string() });
const handle = formPipe().use(InputValidationMiddleware, schema).handle(successYo);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TEST = Expect<
  IsEqual<
    typeof handle,
    FormHandler<
      { status: "error"; error: NameSchemaErrorPayload } | { status: "success"; data: string }
    >
  >
>;

testFormSubmissions(handle);
