import { expect, test } from "vitest";
import { formActionPipe } from "./form-action-pipe.js";
import * as z from "zod";
import { error, interrupt, next, success, Middleware, type ActionResult } from "../core.js";
import { FormValidationMiddleware } from "../middlewares/form-actions/form-validation-middleware.js";
import { getActionError } from "../client-helpers.js";
import type { Expect } from "../../tests/helpers.js";
import type { IsEqual } from "type-fest";

test("OK", async () => {
  const schema = z.object({ value: z.string() });
  const pipe = formActionPipe(schema);

  const handler = pipe.handle(async () => success({ result: "value" }));

  const form = new FormData();
  form.set("value", "value");
  const result = await handler(null, form);
  expect(result.status).toBe("success");
});

/** Regression guard for #10: a handler returning more than one shape. */
const multiBranch = formActionPipe(z.object({ value: z.string() })).handle(async ({ input }) => {
  if (input.value === "taken") return error("taken", "already used" as const);
  return success();
});

{
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TEST = Expect<
    IsEqual<
      Awaited<ReturnType<typeof multiBranch>>,
      | {
          status: "error";
          error: {
            type: "schema";
            data: {
              formErrors: string[];
              fieldErrors: {
                value?: string[] | undefined;
              };
            };
          };
          input: {
            value?: string | undefined;
          };
        }
      | {
          status: "error";
          error: { type: "taken"; data: "already used" };
          input: {
            value?: string | undefined;
          };
        }
      | {
          status: "success";
          data: undefined;
          input: {
            value?: string | undefined;
          };
        }
    >
  >;

  // What #10 actually reports is the call site: `getActionError` bounds its
  // argument by `ActionResponse`, which a collapsed union fails. Deliberately
  // duplicated in `tests/dist-consumer/` — only that copy covers declaration
  // emit, only this one runs in the fast gate.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type CALL_SITE = Expect<
    IsEqual<
      ReturnType<typeof getActionError<Awaited<ReturnType<typeof multiBranch>>, "taken">>,
      "already used" | null
    >
  >;
}

test("multi-branch handler: error branch", async () => {
  const form = new FormData();
  form.set("value", "taken");
  expect(await multiBranch(null, form)).toStrictEqual({
    status: "error",
    error: { type: "taken", data: "already used" },
    input: { value: "taken" },
  });
});

test("multi-branch handler: success branch", async () => {
  const form = new FormData();
  form.set("value", "free");
  expect(await multiBranch(null, form)).toStrictEqual({
    status: "success",
    data: undefined,
    input: { value: "free" },
  });
});

// --- formActionPipe() — no schema ---

test("no schema: handler gets the raw entries, results carry no input echo", async () => {
  const action = formActionPipe().handle(async ({ input }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type RAW = Expect<IsEqual<typeof input, { [k: string]: FormDataEntryValue }>>;
    return success({ keys: Object.keys(input) });
  });

  const form = new FormData();
  form.set("a", "1");
  expect(await action(null, form)).toStrictEqual({ status: "success", data: { keys: ["a"] } });
});

test("no schema: output is pinned to the success/error protocol", () => {
  // @ts-expect-error a bare object is not an ActionResult
  formActionPipe().handle(async () => ({ nope: true }));
});

/**
 * The motivating pattern for the schemaless variant: auth gates validation, so
 * an unauthenticated submit never reaches the schema (no schema leak).
 */
class FakeAuthMiddleware extends Middleware<ActionResult> {
  async before(arg: { input: Record<string, unknown> }) {
    if (arg.input.token !== "ok") return interrupt(error("unauthorized", "no session" as const));
    return next({ user: { name: "flo" } });
  }
  async after(t: this["After"]) {
    return t;
  }
}

let schemaRan = false;
const gatedSchema = z.object({
  value: z.string().refine(() => (schemaRan = true) || true),
});

const gated = formActionPipe()
  .use(FakeAuthMiddleware)
  .use(FormValidationMiddleware, gatedSchema)
  .handle(async ({ input, user }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type INPUT = Expect<IsEqual<typeof input, { value: string }>>;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type USER = Expect<IsEqual<typeof user, { name: string }>>;
    return success({ got: input.value, by: user.name });
  });

{
  // Auth interrupts upstream of FormValidationMiddleware, so that branch — and
  // only that branch — carries no `input` echo.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TEST = Expect<
    IsEqual<
      Awaited<ReturnType<typeof gated>>,
      | { status: "error"; error: { type: "unauthorized"; data: "no session" } }
      | {
          status: "error";
          error: {
            type: "schema";
            data: { formErrors: string[]; fieldErrors: { value?: string[] | undefined } };
          };
          input: { value?: string | undefined };
        }
      | {
          status: "success";
          data: { got: string; by: string };
          input: { value?: string | undefined };
        }
    >
  >;
}

test("auth before validation: unauthorized short-circuits, schema never runs, no input echo", async () => {
  schemaRan = false;
  const form = new FormData();
  form.set("token", "nope");
  form.set("value", "hello");
  expect(await gated(null, form)).toStrictEqual({
    status: "error",
    error: { type: "unauthorized", data: "no session" },
  });
  expect(schemaRan).toBe(false);
});

test("auth before validation: schema failure still echoes input", async () => {
  const form = new FormData();
  form.set("token", "ok");
  const res = await gated(null, form);
  expect(res.status).toBe("error");
  expect(getActionError(res, "schema")?.fieldErrors.value).toBeDefined();
  expect(res).toHaveProperty("input", {});
});

test("auth before validation: happy path", async () => {
  const form = new FormData();
  form.set("token", "ok");
  form.set("value", "hello");
  expect(await gated(null, form)).toStrictEqual({
    status: "success",
    data: { got: "hello", by: "flo" },
    input: { value: "hello" },
  });
});
