import type { Simplify } from "type-fest";

type ActionResponse =
  | { status: "success"; data: unknown }
  | { status: "error"; error: { type: string; data: unknown } };

function getActionError<
  T extends ActionResponse,
  Key extends Extract<T, { status: "error" }>["error"]["type"],
>(value: T | null, key: Key) {
  if (value?.status === "error" && value.error.type === key)
    return value.error.data as Simplify<
      Extract<T, { status: "error"; error: { type: Key; data: unknown } }>["error"]["data"]
    >;

  return null;
}

function getActionInput<T extends ActionResponse>(value: T | null) {
  if (value !== null && "input" in value)
    return value.input as Simplify<Extract<T, { input: unknown }>["input"]>;

  return null;
}

export { getActionError, getActionInput };
