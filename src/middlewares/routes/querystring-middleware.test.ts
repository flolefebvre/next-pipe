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
import { QuerystringMiddleware } from "./querystring-middleware.js";

const schema = z.object({ key: z.string() });

const handle = routePipe()
  .use(QuerystringMiddleware, schema)
  .handle(async ({ query }) => {
    return { status: 200 as const, json: query.key };
  });

test("Valid query passes schema", async () => {
  await expectRouteResponse(await handle(new Request("http://localhost?key=value")), 200, "value");
});

test("Missing query param interrupts with 400", async () => {
  await expectRouteResponse(
    await handle(new Request("http://localhost")),
    400,
    routeSchemaError("querystring", "Invalid input: expected string, received undefined"),
  );
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TEST = Expect<IsEqual<typeof handle, ValidatedRouteHandler<"querystring">>>;
