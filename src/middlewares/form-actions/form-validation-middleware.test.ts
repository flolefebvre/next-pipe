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

// --- input echo: raw submitted strings for the schema's keys (#26) ---

const signUpSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  seats: z.coerce.number().int().max(10),
  avatar: z.any().optional(),
});

const signUp = new Pipe(
  entry((_: unknown, form: FormData) => ({ input: Object.fromEntries(form) })),
)
  .use(FormValidationMiddleware, signUpSchema)
  .handle(async ({ input }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type HANDLER_INPUT = Expect<IsEqual<typeof input.seats, number>>;
    return success(input.seats);
  });

{
  type Result = Awaited<ReturnType<typeof signUp>>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type ECHO = Expect<
    IsEqual<Result["input"], { name?: string; email?: string; seats?: string; avatar?: string }>
  >;
}

test("schema failure echoes the raw strings of every schema key, failed fields included", async () => {
  const form = new FormData();
  form.set("name", "Ada");
  form.set("email", "ada.lovelace@exmaple");
  form.set("seats", "25");
  form.set("avatar", new File(["x"], "avatar.png"));
  form.set("extra", "x");
  const result = await signUp(null, form);
  expect(result.status).toBe("error");
  expect(result).toHaveProperty("error.type", "schema");
  expect(result.input).toStrictEqual({
    name: "Ada",
    email: "ada.lovelace@exmaple",
    seats: "25",
  });
});

test("handler results echo raw strings, while the handler sees parsed values", async () => {
  const form = new FormData();
  form.set("name", "Ada");
  form.set("email", "ada@example.com");
  form.set("seats", "5");
  form.set("extra", "x");
  expect(await signUp(null, form)).toStrictEqual({
    status: "success",
    data: 5,
    input: { name: "Ada", email: "ada@example.com", seats: "5" },
  });
});
