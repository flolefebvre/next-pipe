import { expect, test } from "vitest";
import { getActionError, getActionInput } from "./client-helpers.js";
import type { Expect } from "../tests/helpers.js";
import type { IsEqual } from "type-fest";

type Response =
  | { status: "success"; data: { id: string } }
  | { status: "error"; error: { type: "schema"; data: { field: string } } };

test("returns the error data when the key matches", () => {
  const value: Response = { status: "error", error: { type: "schema", data: { field: "name" } } };

  expect(getActionError(value, "schema")).toStrictEqual({ field: "name" });
});

test("returns null when the error key does not match", () => {
  const value = {
    status: "error",
    error: { type: "other", data: 1 },
  } as unknown as Response;

  expect(getActionError(value, "schema")).toBeNull();
});

test("returns null on a success response", () => {
  const value = { status: "success", data: { id: "1" } } as Response;

  expect(getActionError(value, "schema")).toBeNull();
});

test("returns null when the value is null", () => {
  expect(getActionError(null as Response | null, "schema")).toBeNull();
});

/**
 * A form-action result union where validation sits behind another middleware:
 * the first branch interrupted upstream of FormValidationMiddleware, so it
 * carries no `input`.
 */
type GatedResponse =
  | { status: "error"; error: { type: "unauthorized"; data: string } }
  | {
      status: "error";
      error: { type: "schema"; data: { field: string } };
      input: { name?: string | undefined };
    }
  | { status: "success"; data: undefined; input: { name?: string | undefined } };

test("getActionInput returns the echoed input when present", () => {
  const value: GatedResponse = { status: "success", data: undefined, input: { name: "flo" } };

  const input = getActionInput(value);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type INPUT = Expect<IsEqual<typeof input, { name?: string | undefined } | null>>;
  expect(input).toStrictEqual({ name: "flo" });
});

test("getActionInput returns null on a branch without input", () => {
  const value: GatedResponse = { status: "error", error: { type: "unauthorized", data: "nope" } };

  expect(getActionInput(value)).toBeNull();
});

test("getActionInput returns null when the value is null", () => {
  expect(getActionInput(null as GatedResponse | null)).toBeNull();
});
