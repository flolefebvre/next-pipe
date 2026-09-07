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
import { FormValidationMiddleware } from "./form-validation-middleware.js";

const schema = z.object({ name: z.string() });
const handle = formPipe().use(FormValidationMiddleware, schema).handle(successYo);

/** Unlike the action middleware, this one echoes the partially-parsed input back on both branches. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TEST = Expect<
  IsEqual<
    typeof handle,
    FormHandler<
      | {
          status: "error";
          error: NameSchemaErrorPayload;
          input: { name?: string | undefined };
        }
      | {
          status: "success";
          data: string;
          input: { name?: string | undefined };
        }
    >
  >
>;

testFormSubmissions(handle);
