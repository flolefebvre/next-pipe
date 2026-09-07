import { test } from "vitest";
import * as z from "zod";
import type { IsEqual } from "type-fest";
import {
  expectRouteResponse,
  routePipe,
  routeSchemaError,
  type Expect,
  type ValidatedRouteHandler,
} from "../../../tests/unit-fixtures.js";
import { BodyValidationMiddleware } from "./body-validation-middleware.js";

const schema = z.object({ key: z.string() });

const handle = routePipe()
  .use(BodyValidationMiddleware, schema)
  .handle(async () => {
    return { status: 200 as const, json: "ok" };
  });

const post = (key: unknown) =>
  new Request("http://localhost", { method: "POST", body: JSON.stringify({ key }) });

test("Valid body passes schema", async () => {
  await expectRouteResponse(await handle(post("value")), 200, "ok");
});

test("Invalid body interrupts with 400", async () => {
  await expectRouteResponse(
    await handle(post(123)),
    400,
    routeSchemaError("schema", "Invalid input: expected string, received number"),
  );
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TEST = Expect<IsEqual<typeof handle, ValidatedRouteHandler<"schema">>>;
