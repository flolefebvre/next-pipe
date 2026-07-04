import { expect, test } from "vitest";
import { getActionError } from "./client-helpers.js";

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
