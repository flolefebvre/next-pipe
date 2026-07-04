import { expect, test } from "vitest";
import { actionPipe } from "./action-pipe.js";
import { success } from "../core.js";
import z from "zod";

test("no-input action returns its success result", async () => {
  const handler = actionPipe().handle(async () => success({ ok: true }));

  const result = await handler();
  expect(result.status).toBe("success");
});

test("action with schema parses valid input", async () => {
  const handler = actionPipe(z.object({ name: z.string() })).handle(async ({ input }) =>
    success(input.name),
  );

  const result = await handler({ name: "value" });
  expect(result).toStrictEqual({ status: "success", data: "value" });
});

test("action with schema short-circuits on invalid input", async () => {
  const handler = actionPipe(z.object({ name: z.string() })).handle(async () =>
    success("unreached"),
  );

  const result = await handler({ name: 123 } as never);
  expect(result.status).toBe("error");
  if (result.status === "error") expect(result.error.type).toBe("schema");
});
