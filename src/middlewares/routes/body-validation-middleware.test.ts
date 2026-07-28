import { expect, test } from "vitest";
import { entry, Pipe, type __MIDDLEWARE_CONFIG, type MiddlewareConfig } from "../../core.js";
import { ResponseMiddleware } from "./response-middleware.js";
import { BodyValidationMiddleware } from "./body-validation-middleware.js";
import type { Expect } from "../../../tests/helpers.js";
import type { IsEqual } from "type-fest";
import type { JsonValue } from "../../types.js";
import type { NextResponse } from "next/server.js";
import * as z from "zod";

const schema = z.object({ key: z.string() });

const handle = new Pipe(entry((req: Request) => ({ req })))
  .use(ResponseMiddleware)
  .use(BodyValidationMiddleware, schema)
  .handle(async () => {
    return { status: 200 as const, json: "ok" };
  });

test("Valid body passes schema", async () => {
  const req = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ key: "value" }),
  });
  const result = await handle(req);
  expect(result.status).toBe(200);
  expect(await result.json()).toBe("ok");
});

test("Invalid body interrupts with 400", async () => {
  const req = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ key: 123 }),
  });
  const result = await handle(req);
  expect(result.status).toBe(400);
  expect(await result.json()).toStrictEqual({
    status: "error",
    error: {
      type: "schema",
      data: {
        formErrors: [],
        fieldErrors: {
          key: ["Invalid input: expected string, received number"],
        },
      },
    },
  });
});

type EXPECTED = (req: Request) => Promise<
  NextResponse<JsonValue> & {
    [__MIDDLEWARE_CONFIG]: MiddlewareConfig<"schema", z.infer<typeof schema>> &
      MiddlewareConfig<
        "output",
        | {
            readonly status: 400;
            readonly json: {
              status: "error";
              error: {
                type: "schema";
                data: {
                  formErrors: string[];
                  fieldErrors: {
                    key?: string[] | undefined;
                  };
                };
              };
            };
          }
        | {
            status: 200;
            json: string;
          }
      >;
  }
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TEST = Expect<IsEqual<typeof handle, EXPECTED>>;
