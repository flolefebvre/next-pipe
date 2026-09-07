/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect, test } from "vitest";
import { OutputTypeMiddleware } from "./output-type-middleware.js";
import {
  AfterMiddleware,
  PassThrough,
  Pipe,
  success,
  type Apply,
  type ActionResult,
} from "../core.js";
import type { Expect } from "../../tests/helpers.js";
import type { IsEqual } from "type-fest";

/** What both roots below must infer for a handler returning `success("value")`. */
type SuccessString = () => Promise<{ status: "success"; data: string }>;
const successValue = async () => success("value");
const expectSuccessValue = (handle: () => Promise<unknown>) =>
  expect(handle()).resolves.toStrictEqual(success("value"));

test("SucessOrError", async function () {
  const handle = new Pipe(OutputTypeMiddleware<ActionResult>).handle(successValue);

  await expectSuccessValue(handle);
  type TEST = Expect<IsEqual<typeof handle, SuccessString>>;
});

test("Passthrough + use SucessOrError", async function () {
  const handle = new Pipe(PassThrough).use(OutputTypeMiddleware<ActionResult>).handle(successValue);

  await expectSuccessValue(handle);
  type TEST = Expect<IsEqual<typeof handle, SuccessString>>;
});

test("Middleware transforms string into success", async function () {
  class MyMiddleware extends AfterMiddleware<string> {
    async after(t: this["After"]) {
      return success(t);
    }
  }
  const pipe = new Pipe(PassThrough).use(OutputTypeMiddleware<ActionResult>).use(MyMiddleware);
  const handle = pipe.handle(async () => "hey");

  type TEST = Expect<IsEqual<typeof handle, () => Promise<{ status: "success"; data: "hey" }>>>;
  await expect(handle()).resolves.toStrictEqual(success("hey"));

  // @ts-expect-error 3 should be a string
  const handleError = pipe.handle(async () => 3);
});

// Error in typing
{
  class MyMiddleware extends AfterMiddleware {
    async after(t: this["After"]) {
      return "String !";
    }
  }
  // @ts-expect-error MyMiddleware should return a SuccesOrError value
  const pipe = new Pipe(PassThrough).use(OutputTypeMiddleware<ActionResult>).use(MyMiddleware);
}
{
  class MyMiddleware extends AfterMiddleware<string> {
    async after(t: this["After"]) {
      return t;
    }
  }
  // @ts-expect-error MyMiddleware should return a SuccesOrError value
  const pipe = new Pipe(PassThrough).use(OutputTypeMiddleware<ActionResult>).use(MyMiddleware);
}
