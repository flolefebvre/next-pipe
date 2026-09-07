// Setup that several `src/**/*.test.ts` files need verbatim. Assertions stay in
// the tests that make them: a type-level assertion moved behind a typed
// parameter would assert nothing.
//
// Separate from `./helpers.ts` because this module reaches into `src/`, and
// `helpers.ts` is also read by the `tests/dist-consumer/**` fixture, which must
// never compile against `src/`.

import { expect, test } from "vitest";
import {
  BeforeMiddleware,
  entry,
  next,
  Pipe,
  success,
  type __MIDDLEWARE_CONFIG,
  type MiddlewareConfig,
} from "../src/core.js";
import { ResponseMiddleware } from "../src/middlewares/routes/response-middleware.js";
import type { JsonValue } from "../src/types.js";
import type { NextResponse } from "next/server.js";

// Re-exported so a test that needs a fixture has a single import to make.
export type { Expect } from "./helpers.js";

/** The route pipe the `routes/*-middleware` tests validate against. */
export const routePipe = () => new Pipe(entry((req: Request) => ({ req }))).use(ResponseMiddleware);

/** The form-action pipe the `input`/`form` validation-middleware tests validate against. */
export const formPipe = () =>
  new Pipe(entry((_: unknown, form: FormData) => ({ input: Object.fromEntries(form) })));

/** The handler both form-validation middleware tests pipe into. */
export const successYo = async () => success("yo");

/** The call signature a `formPipe()` handler resolves to. */
export type FormHandler<TResult> = (_: unknown, form: FormData) => Promise<TResult>;

/**
 * The resolved public type of a `routePipe()` guarded by a route validation
 * middleware built on `z.object({ key: z.string() })` and handling with
 * `{ status: 200, json: string }`. Spelled out rather than derived, so it
 * fails when inference drifts (#8).
 */
export type ValidatedRouteHandler<TKey extends string> = (req: Request) => Promise<
  NextResponse<JsonValue> & {
    [__MIDDLEWARE_CONFIG]: MiddlewareConfig<TKey, { key: string }> &
      MiddlewareConfig<
        "output",
        | {
            readonly status: 400;
            readonly json: {
              status: "error";
              error: {
                type: TKey;
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

/** Asserts the status and the decoded JSON body a route handler responded with. */
export const expectRouteResponse = async (
  response: { status: number; json: () => Promise<unknown> },
  status: number,
  json: unknown,
) => {
  expect(response.status).toBe(status);
  expect(await response.json()).toStrictEqual(json);
};

/** The 400 body a route validation middleware returns for a bad `{ key: string }` payload. */
export const routeSchemaError = (type: string, message: string) => ({
  status: "error",
  error: {
    type,
    data: { formErrors: [], fieldErrors: { key: [message] } },
  },
});

/** The flattened-zod error payload a `z.object({ name: z.string() })` schema produces. */
export type NameSchemaErrorPayload = {
  type: "schema";
  data: {
    formErrors: string[];
    fieldErrors: {
      name?: string[] | undefined;
    };
  };
};

/** Submits a single-field form and asserts the action status it resolves to. */
const expectFormStatus = async (
  handle: FormHandler<{ status: string }>,
  field: string,
  status: "success" | "error",
) => {
  const form = new FormData();
  form.set(field, "value");
  const result = await handle(null, form);
  expect(result.status).toBe(status);
};

/**
 * The submissions every form-validation middleware must handle the same way:
 * the schema's field succeeds, a stray field errors. Registered from here
 * because both middleware tests assert exactly this, verbatim.
 */
export const testFormSubmissions = (handle: FormHandler<{ status: string }>) => {
  test("success", async () => {
    await expectFormStatus(handle, "name", "success");
  });

  test("error", async () => {
    await expectFormStatus(handle, "namee", "error");
  });
};

/** Adds a `theme` to the pipe context, without depending on anything upstream. */
export class ThemeMiddleware extends BeforeMiddleware {
  async before() {
    return next({ theme: "dark" });
  }
}

/** Asserts what a children-carrying pipe renders once `ThemeMiddleware` sits in front of it. */
export const expectThemedRender = (handler: (props: { children: string }) => Promise<string>) =>
  expect(handler({ children: "child" })).resolves.toBe("dark: child");

/** Resolves the route `params` into an `entity`, so it depends on the pipe's props. */
export class LoadEntityMiddleware extends BeforeMiddleware {
  async before(arg: { params: Promise<{ id: string }> }) {
    const { id } = await arg.params;
    return next({ entity: `entity-${id}` });
  }
}
