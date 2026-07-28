import { expect, test } from "vitest";
import { entry, Pipe, success } from "../../core.js";
import type { Expect } from "../../../tests/helpers.js";
import type { IsEqual } from "type-fest";
import * as z from "zod";
import { FormValidationMiddleware } from "./form-validation-middleware.js";

const schema = z.object({ name: z.string() });

const handle = new Pipe(
  entry((_: unknown, form: FormData) => ({ input: Object.fromEntries(form) })),
)
  .use(FormValidationMiddleware, schema)
  .handle(async () => success("yo"));

{
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TEST = Expect<
    IsEqual<
      typeof handle,
      (
        _: unknown,
        form: FormData,
      ) => Promise<
        | {
            status: "error";
            error: {
              type: "schema";
              data: {
                formErrors: string[];
                fieldErrors: {
                  name?: string[] | undefined;
                };
              };
            };
            input: {
              name?: string | undefined;
            };
          }
        | {
            status: "success";
            data: string;
            input: {
              name?: string | undefined;
            };
          }
      >
    >
  >;
}

test("success", async () => {
  const form = new FormData();
  form.set("name", "value");
  const result = await handle(null, form);
  expect(result.status).toBe("success");
});

test("error", async () => {
  const form = new FormData();
  form.set("namee", "value");
  const result = await handle(null, form);
  expect(result.status).toBe("error");
});
