import { expect, test } from "vitest";
import { entry, error, Pipe, success } from "../../core.js";
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
    IsEqual<
      Extract<Result, { status: "error" }>["input"],
      { name?: string; email?: string; seats?: string; avatar?: string }
    >
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
  expect(result).toHaveProperty("error.type", "schema");
  expect(result).toHaveProperty("input", {
    name: "Ada",
    email: "ada.lovelace@exmaple",
    seats: "25",
  });
});

function signUpForm(name: string) {
  const form = new FormData();
  form.set("name", name);
  form.set("email", "ada@example.com");
  form.set("seats", "5");
  form.set("password", "hunter22");
  form.set("extra", "x");
  return form;
}

test("by default, a success carries no echo, while the handler sees parsed values", async () => {
  expect(await signUp(null, signUpForm("Ada"))).toStrictEqual({ status: "success", data: 5 });
});

const passwordSchema = signUpSchema.extend({ password: z.string() });

const signUpEchoingAlways = new Pipe(
  entry((_: unknown, form: FormData) => ({ input: Object.fromEntries(form) })),
)
  .use(FormValidationMiddleware, passwordSchema, { echo: "always", omit: ["password"] })
  .handle(async ({ input }) => success(input.seats));

const signUpEchoingErrors = new Pipe(
  entry((_: unknown, form: FormData) => ({ input: Object.fromEntries(form) })),
)
  .use(FormValidationMiddleware, passwordSchema, { omit: ["password"] })
  .handle(async ({ input }) =>
    input.name === "Taken" ? error("nameTaken", "That name is taken") : success(input.seats),
  );

{
  type AlwaysResult = Awaited<ReturnType<typeof signUpEchoingAlways>>;
  type OnErrorResult = Awaited<ReturnType<typeof signUpEchoingErrors>>;
  type Echo = { name?: string; email?: string; seats?: string; avatar?: string };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type OMITTED_FROM_EVERY_ECHO = Expect<IsEqual<getEcho<AlwaysResult>, Echo>>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type ALWAYS_ECHOES_SUCCESS = Expect<
    IsEqual<
      Extract<AlwaysResult, { status: "success" }>,
      { status: "success"; data: number; input: Echo }
    >
  >;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type ON_ERROR_SKIPS_SUCCESS = Expect<
    IsEqual<Extract<OnErrorResult, { status: "success" }>, { status: "success"; data: number }>
  >;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type ON_ERROR_ECHOES_EVERY_ERROR = Expect<IsEqual<getEcho<OnErrorResult>, Echo>>;
}

type getEcho<T> = T extends { input: infer I } ? I : never;

const echoedSignUp = { name: "Ada", email: "ada@example.com", seats: "5" };

test("echo: always echoes successes too", async () => {
  expect(await signUpEchoingAlways(null, signUpForm("Ada"))).toStrictEqual({
    status: "success",
    data: 5,
    input: echoedSignUp,
  });
});

test("echo: onError echoes a handler's error, and omit leaves the password out", async () => {
  expect(await signUpEchoingErrors(null, signUpForm("Taken"))).toStrictEqual({
    status: "error",
    error: { type: "nameTaken", data: "That name is taken" },
    input: { ...echoedSignUp, name: "Taken" },
  });
});

test("omit leaves the field out of a schema failure's echo", async () => {
  const form = signUpForm("A");
  expect(await signUpEchoingAlways(null, form)).toHaveProperty("input", {
    ...echoedSignUp,
    name: "A",
  });
});

test("omit only accepts schema keys", () => {
  // @ts-expect-error "passwrd" is not a key of the schema
  new FormValidationMiddleware(passwordSchema, { omit: ["passwrd"] });
});
