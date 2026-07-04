import { expect, test } from "vitest";
import {
  BeforeMiddleware,
  interrupt,
  next,
  Pipe,
  type __MIDDLEWARE_CONFIG,
  type MiddlewareConfig,
} from "../../core.js";
import { ResponseMiddleware } from "./response-middleware.js";
import type { Expect } from "../../../tests/helpers.js";
import type { IsEqual } from "type-fest";
import type { JsonValue } from "../../types.js";
import type { NextResponse } from "next/server.js";

test("Formats response", async () => {
  const handle = new Pipe(ResponseMiddleware).handle(async () => {
    if (Math.random() < 0) return { status: 200 as const, json: "oh" };
    else return { status: 404 as const, json: { value: "ah" } };
  });

  const result = await handle();
  expect(result.status).toBe(404);
  expect(await result.json()).toStrictEqual({ value: "ah" });

  type EXPECTED = () => Promise<
    NextResponse<JsonValue> & {
      [__MIDDLEWARE_CONFIG]: MiddlewareConfig<
        "output",
        | {
            status: 200;
            json: string;
          }
        | {
            status: 404;
            json: {
              value: string;
            };
          }
      >;
    }
  >;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TEST = Expect<IsEqual<typeof handle, EXPECTED>>;
});

test("With interrupt middleware", async () => {
  class Interrupter extends BeforeMiddleware {
    async before() {
      if (Math.random() < 2) return interrupt({ status: 400, json: "error !" } as const);
      else return next({});
    }
  }

  const handle = new Pipe(ResponseMiddleware).use(Interrupter).handle(async () => {
    return { status: 200, json: "oh" } as const;
  });

  const result = await handle();
  expect(result.status).toBe(400);
  expect(await result.json()).toStrictEqual("error !");

  type EXPECTED = () => Promise<
    NextResponse<JsonValue> & {
      [__MIDDLEWARE_CONFIG]: MiddlewareConfig<
        "output",
        | {
            readonly status: 400;
            readonly json: "error !";
          }
        | {
            readonly status: 200;
            readonly json: "oh";
          }
      >;
    }
  >;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TEST = Expect<IsEqual<typeof handle, EXPECTED>>;
});
