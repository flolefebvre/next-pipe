import { expect, test } from "vitest";
import { formActionPipe } from "./form-action-pipe.js";
import z from "zod";
import { success } from "../core.js";

test("OK", async () => {
  const schema = z.object({ value: z.string() });
  const pipe = formActionPipe(schema);

  const handler = pipe.handle(async () => success({ result: "value" }));

  const form = new FormData();
  form.set("value", "value");
  const result = await handler(null, form);
  expect(result.status).toBe("success");
});
