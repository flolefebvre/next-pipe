import { expect, test } from "vitest";
import { formActionPipe } from "./form-action-pipe.js";
import * as z from "zod";
import { error, success } from "../core.js";
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

/**
 * A handler with more than one return shape (#10). `after` merges the echoed
 * `input` into each member separately, so every branch keeps its own payload
 * key — a collapsed `{ status: "error" | "success"; input }` no longer
 * satisfies `ActionResponse` and breaks `getActionError` at the call site.
 */
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

  // The symptom the issue actually reports: `getActionError` bounds its
  // argument by `ActionResponse`, which a collapsed union fails. Asserted here
  // and not only in `tests/dist-consumer/` so the fast gate reproduces it too.
  // Type-level only — instantiating it is enough to check the bound.
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
