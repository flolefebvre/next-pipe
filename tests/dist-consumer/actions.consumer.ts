/**
 * Server actions and form actions, resolved through the built `dist`.
 *
 * Every expectation below is the shape the same code produces when compiled
 * against `src` — verified there before being written here — so a failure
 * means declaration emit lost type information on the way out.
 */

import z from "zod";
import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import { actionPipe, formActionPipe } from "@flefebvre/next-pipe/pipes";
import { success } from "@flefebvre/next-pipe/server";
import { getActionError } from "@flefebvre/next-pipe/client";

const schema = z.object({ name: z.string() });

/* --- form actions --- */

const formAction = formActionPipe(schema).handle(async (arg) => {
  type FormActionInputIsNotAny = Expect<Not<IsAny<(typeof arg)["input"]>>>;
  type FormActionInputIsTyped = Expect<IsEqual<typeof arg, { input: { name: string } }>>;
  return success(arg.input.name);
});

type FormResult = Awaited<ReturnType<typeof formAction>>;

type FormActionResultIsTyped = Expect<
  IsEqual<
    FormResult,
    | {
        status: "error";
        error: {
          type: "schema";
          data: { formErrors: string[]; fieldErrors: { name?: string[] | undefined } };
        };
        input: { name?: string | undefined };
      }
    | { status: "success"; data: string; input: { name?: string | undefined } }
  >
>;

declare const formResult: FormResult;
const fieldErrors = getActionError(formResult, "schema");

type FieldErrorsAreNotAny = Expect<Not<IsAny<NonNullable<typeof fieldErrors>["fieldErrors"]>>>;
type FieldErrorsAreTyped = Expect<
  IsEqual<
    typeof fieldErrors,
    { formErrors: string[]; fieldErrors: { name?: string[] | undefined } } | null
  >
>;

/* --- server actions --- */

const action = actionPipe(schema).handle(async (arg) => {
  type ActionInputIsNotAny = Expect<Not<IsAny<(typeof arg)["input"]>>>;
  type ActionInputIsTyped = Expect<IsEqual<typeof arg, { input: { name: string } }>>;
  return success(arg.input.name.length);
});

declare const actionResult: Awaited<ReturnType<typeof action>>;

type ActionErrorIsTyped = Expect<
  IsEqual<
    ReturnType<typeof getActionError<typeof actionResult, "schema">>,
    { formErrors: string[]; fieldErrors: { name?: string[] | undefined } } | null
  >
>;

export type {
  FormActionResultIsTyped,
  FieldErrorsAreNotAny,
  FieldErrorsAreTyped,
  ActionErrorIsTyped,
};
export { formAction, action };
