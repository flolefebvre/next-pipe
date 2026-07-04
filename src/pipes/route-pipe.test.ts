import { routePipe } from "./route-pipe.js";
import { json } from "../helpers.js";
import { expect, test } from "vitest";

test("Simple", async () => {
  const pipe = routePipe();
  const handler = pipe.handle(async () => json(200, "hey"));

  const result = await handler(
    new Request("http://localhost:3000/theroute"),
    null as unknown as never,
  );
  expect(result.status).toBe(200);
  await expect(result.json()).resolves.toStrictEqual("hey");
});

test("With Context", async () => {
  const pipe = routePipe<{ params: Promise<{ id: string }> }>();
  const handler = pipe.handle(async ({ ctx }) => json(200, (await ctx.params).id));

  const result = await handler(new Request("http://localhost:3000/theroute"), {
    params: Promise.resolve({ id: "yo" }),
  });
  expect(result.status).toBe(200);
  await expect(result.json()).resolves.toStrictEqual("yo");
});
