/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect, test } from "vitest";
import {
  AfterMiddleware,
  BeforeMiddleware,
  entry,
  error,
  interrupt,
  Middleware,
  next,
  PassThrough,
  createPipe,
  merge,
  Pipe,
  success,
  __MIDDLEWARE_CONFIG,
  type ActionResult,
} from "./core.js";
import { OutputTypeMiddleware } from "./middlewares/output-type-middleware.js";
import type { IsEqual } from "type-fest";
import type { ReactNode } from "react";
import type { Expect } from "../tests/helpers.js";

/**
 * Shared after-middlewares used across the type + runtime tests below.
 */

/** string => {value:string} */
class M1 extends AfterMiddleware<string> {
  async after(t: this["After"]) {
    return { value: t };
  }
}

/** {value:string} => {value2:string} */
class M2 extends AfterMiddleware<{ value: string }> {
  async after(t: this["After"]): Promise<{ value2: (typeof t)["value"] }> {
    return { value2: t.value };
  }
}

class ReactNodeMiddleware extends AfterMiddleware<ReactNode> {
  async after(t: this["After"]) {
    return t;
  }
}

/**
 * Shared fixtures for the tests below. They exist so the same setup is written
 * once; every assertion stays in the test that makes it, since a type-level
 * assertion moved behind a typed parameter would assert nothing.
 */

/**
 * Always interrupts with `value`. `fail` is annotated `boolean` so TypeScript
 * cannot narrow the branch away — the `next` branch keeps the union alive for
 * the type-level assertions — while the runtime result stays deterministic.
 */
const fail: boolean = true;
const makeFail = <T>(value: T) =>
  class FailMiddleware extends BeforeMiddleware {
    async before() {
      if (fail) return interrupt(value);
      else return next({ id: "the id" as const });
    }
  };

/** Turns the entry's `req` into a `user`, so it depends on what the entry provides. */
class AddUserFromRequest extends BeforeMiddleware {
  async before(arg: { req: Request }) {
    return next({ user: { id: "string" } });
  }
}

/** A handler returning the literal `"yo"`, reshaped by `M1` into `{ value: "yo" }`. */
const returnYo = async () => "yo" as const;
type YoValue = () => Promise<{ value: "yo" }>;
const expectYoValue = async (handle: () => Promise<unknown>) =>
  expect(await handle()).toStrictEqual({ value: "yo" });

/** The output shape `OutputTypeMiddleware` is constrained with in the tests below. */
type SuccessOrError = { status: "success"; data: unknown } | { status: "error"; error: unknown };

const successOrErrorHandler = async () => {
  if (Math.random()) return success("hey" as const);
  else return error("yo" as const);
};
type SuccessOrErrorResult = () => Promise<
  { status: "success"; data: "hey" } | { status: "error"; error: "yo" }
>;
/** `Math.random()` is truthy, so `successOrErrorHandler` always takes the success branch. */
const expectHey = async (handle: () => Promise<unknown>) =>
  expect(await handle()).toStrictEqual({ status: "success", data: "hey" });

/**
 * The same handler piped with and without an `OutputTypeMiddleware<ActionResult>`:
 * both must infer the same output type and produce the same value.
 */
const bothPipes = <T extends ActionResult>(handler: () => Promise<T>) =>
  [
    new Pipe(PassThrough).handle(handler),
    new Pipe(PassThrough).use(OutputTypeMiddleware<ActionResult>).handle(handler),
  ] as const;

/** True only when *both* handles resolve to exactly `TExpected`. Asserted via `Expect` at each use. */
type BothInfer<THandles extends readonly [unknown, unknown], TExpected> =
  IsEqual<THandles[0], TExpected> extends true ? IsEqual<THandles[1], TExpected> : false;

const expectBoth = async <T>(
  handles: readonly [() => Promise<T>, () => Promise<T>],
  expected: unknown,
) => {
  expect(await handles[0]()).toStrictEqual(expected);
  expect(await handles[1]()).toStrictEqual(expected);
};

test("Can instantiate base pipe", () => {
  const pipe = new Pipe(PassThrough);
});

test("Can add user and return its id", async () => {
  class AddUser extends BeforeMiddleware {
    async before() {
      // Requête prisma pour chopper le user et on le renvoie
      return next({ user: { id: "12" } });
    }
  }

  const pipe = new Pipe(PassThrough).use(AddUser).handle(async ({ user }) => user.id);
  const result = await pipe();

  expect(result).toBe("12");
});

test("Add time logger", async () => {
  let fakeTimerValue = 5;
  const fakeTimer = () => {
    fakeTimerValue *= 2;
    return fakeTimerValue;
  };

  class TimerMiddleware extends Middleware {
    private timeInBefore = 0;

    async before() {
      this.timeInBefore = fakeTimer();
      return next({});
    }
    async after(t: this["After"]) {
      const executionTime = fakeTimer() - this.timeInBefore;
      return { value: t, executionTime };
    }
  }

  const handler = createPipe()
    .use(TimerMiddleware)
    .handle(async () => ({ data: "salut" as const }));

  const result = await handler();
  expect(result).toStrictEqual({ value: { data: "salut" }, executionTime: 10 });
});

test("Error from handler", async () => {
  {
    const handles = bothPipes(async () => {
      return success({ key: "yo" as const });
    });

    type Expected = () => Promise<{ status: "success"; data: { key: "yo" } }>;
    type TESTS = Expect<BothInfer<typeof handles, Expected>>;

    await expectBoth(handles, { status: "success", data: { key: "yo" } });
  }
  {
    const handles = bothPipes(async () => {
      if (Math.random() < 0) return success({ key: "yo" as const });
      return error("login", { key: "logerror" as const });
    });

    type Expected = () => Promise<
      | { status: "success"; data: { key: "yo" } }
      | { status: "error"; error: { type: "login"; data: { key: "logerror" } } }
    >;
    type TESTS = Expect<BothInfer<typeof handles, Expected>>;

    await expectBoth(handles, {
      status: "error",
      error: { type: "login", data: { key: "logerror" } },
    });
  }
  {
    const handles = bothPipes(async () => {
      if (Math.random() < 0) throw new Error("");
      return error("login", { key: "" });
    });

    type Expected = () => Promise<{
      status: "error";
      error: { type: "login"; data: { key: string } };
    }>;
    type TESTS = Expect<BothInfer<typeof handles, Expected>>;

    await expectBoth(handles, {
      status: "error",
      error: { type: "login", data: { key: "" } },
    });
  }
});

test("Nobody returns anything", async () => {
  const handler = async () => {
    throw new Error("never !");
  };

  {
    const pipe = new Pipe(PassThrough);
    const handle = pipe.handle(handler);
    type TEST = Expect<IsEqual<typeof handle, () => Promise<never>>>;
    await expect(handle()).rejects.toThrow("never !");
  }
  {
    const pipe = new Pipe(
      entry((_: unknown, form: FormData) => ({
        input: Object.fromEntries(form),
      })),
    );
    const handle = pipe.handle(handler);
    type Test = Expect<IsEqual<typeof handle, (_: unknown, form: FormData) => Promise<never>>>;
    await expect(handle(null, new FormData())).rejects.toThrow("never !");
  }
});

test("Raw input is kept in the first middleware", async () => {
  const pipe = new Pipe(entry((s: string) => ({ s })));
  const handle = pipe.handle(async (arg) => ({ ...arg }));
  await expect(handle("yo")).resolves.toStrictEqual({ s: "yo" });

  const handle2 = pipe.use(PassThrough).handle(async (arg) => ({ ...arg }));
  await expect(handle2("yo")).resolves.toStrictEqual({ s: "yo" });
});

// =============================================================================
// Ported from core.types-test.ts. Each former `{ ... }` block becomes one test
// that preserves the original type-level assertions (enforced by `tsc`) and
// adds runtime checks (enforced by vitest).
// =============================================================================

test("middleware config is exposed under the config symbol", async () => {
  class MiddlewareWithConfig extends PassThrough {
    declare config: Record<"output", this["After"]>;
  }

  const pipe = new Pipe(MiddlewareWithConfig).use(MiddlewareWithConfig);
  const handle = pipe.handle(async () => 2);
  type R = Awaited<ReturnType<typeof handle>>[typeof __MIDDLEWARE_CONFIG]["output"];

  expect(await handle()).toBe(2);
});

test("Pipe constructor forwards entry middleware params", () => {
  class MiddlewareWithParams extends PassThrough {
    constructor(s: string, opts?: { code: number }) {
      super();
    }
  }

  expect(new Pipe(MiddlewareWithParams, "salut")).toBeInstanceOf(Pipe);
});

test("use() validates middleware constructor params", () => {
  class MiddlewareWithParams extends PassThrough {
    constructor(s: string, opts?: { code: number }) {
      super();
    }
  }
  createPipe().use(MiddlewareWithParams, "", { code: 3 });
  createPipe().use(MiddlewareWithParams, "");
  // @ts-expect-error missing required params
  createPipe().use(MiddlewareWithParams);
  // @ts-expect-error expects string
  createPipe().use(MiddlewareWithParams, 3);

  expect(createPipe().use(MiddlewareWithParams, "")).toBeInstanceOf(Pipe);
});

test("base pipe handlers are callable", async () => {
  const handle = new Pipe(PassThrough).handle(async () => "yo");
  const handle2 = new Pipe(PassThrough).use(PassThrough).handle(async () => "yo");

  expect(await handle()).toBe("yo");
  expect(await handle2()).toBe("yo");
});

test("interrupt unions into the after-shaped result", async () => {
  const handle = new Pipe(PassThrough)
    .use(M1)
    .use(makeFail("inter" as const))
    .handle(async () => "return" as const);
  type TEST = Expect<
    IsEqual<typeof handle, () => Promise<{ value: "return" } | { value: "inter" }>>
  >;

  // makeFail always interrupts at runtime, flowing "inter" back through M1.after.
  expect(await handle()).toStrictEqual({ value: "inter" });
});

test("multiple interrupts each union into the result", async () => {
  const handle = new Pipe(PassThrough)
    .use(M1)
    .use(makeFail("inter" as const))
    .use(makeFail("inter2" as const))
    .handle(async () => "return" as const);
  type TEST = Expect<
    IsEqual<
      typeof handle,
      () => Promise<{ value: "return" } | { value: "inter" } | { value: "inter2" }>
    >
  >;

  // The innermost interrupt wins: outer middlewares just pass it through.
  expect(await handle()).toStrictEqual({ value: "inter" });
});

test("interrupts flow back through after middlewares", async () => {
  class MNumberString extends AfterMiddleware<number> {
    async after(t: this["After"]) {
      return t.toString();
    }
  }

  const handle = new Pipe(PassThrough)
    .use(M1)
    .use(MNumberString)
    .use(makeFail(3 as const))
    .use(makeFail(5 as const))
    .handle(async () => 12 as const);
  type TEST = Expect<IsEqual<typeof handle, () => Promise<{ value: string }>>>;

  // 3 -> MNumberString.after -> "3" -> M1.after -> { value: "3" }
  expect(await handle()).toStrictEqual({ value: "3" });
});

test("interrupt value must fit the preceding after input", () => {
  const pipe = new Pipe(PassThrough)
    .use(M1)
    // @ts-expect-error expects string
    .use(makeFail(3));

  expect(pipe).toBeInstanceOf(Pipe);
});

test("single interrupt unions with handler return", async () => {
  const pipe = new Pipe(PassThrough)
    .use(makeFail("interruption" as const))
    .handle(async () => "hey" as const);
  type TEST = Expect<IsEqual<typeof pipe, () => Promise<"hey" | "interruption">>>;

  expect(await pipe()).toBe("interruption");
});

test("interrupts compose across a long middleware chain", async () => {
  class AddUser extends BeforeMiddleware {
    async before() {
      return next({ user: { id: "string" } });
    }
  }

  const pipe = new Pipe(PassThrough)
    .use(makeFail("interruption" as const))
    .use(makeFail("interruption2" as const))
    .use(AddUser)
    .use(makeFail("interruption3" as const))
    .use(makeFail({ error: "error" as const }))
    .use(PassThrough)
    .handle(async () => "hey" as const);
  type TEST = Expect<
    IsEqual<
      typeof pipe,
      () => Promise<"hey" | "interruption" | "interruption2" | "interruption3" | { error: "error" }>
    >
  >;

  // TODO: Vérifier que le interrupt peut pas renvoyer un truc qui rentre pas dans le after d'avant !
  // TODO: si ça passe dans un after sur le retour !

  // The innermost interrupt wins at runtime.
  expect(await pipe()).toBe("interruption");
});

test("OutputTypeMiddleware constrains and preserves the output type", async () => {
  const handle = new Pipe(PassThrough).use(OutputTypeMiddleware<string>).handle(async () => "");
  type TEST = Expect<IsEqual<typeof handle, () => Promise<"">>>;

  expect(await handle()).toBe("");
});

test("OutputTypeMiddleware works mid-chain and rejects wrong returns", async () => {
  const handle = new Pipe(PassThrough)
    .use(PassThrough)
    .use(OutputTypeMiddleware<string>)
    .use(PassThrough)
    .use(PassThrough)
    .handle(async () => "");
  type TEST = Expect<IsEqual<typeof handle, () => Promise<"">>>;

  new Pipe(PassThrough)
    .use(PassThrough)
    .use(OutputTypeMiddleware<string>)
    .use(PassThrough)
    .use(PassThrough)
    // @ts-expect-error expects string
    .handle(async () => 3);

  expect(await handle()).toBe("");
});

test("OutputTypeMiddleware narrows unknown object fields", async () => {
  const handle = new Pipe(PassThrough)
    .use(OutputTypeMiddleware<{ value: unknown }>)
    .handle(async () => ({ value: 3 }));
  type TEST = Expect<IsEqual<typeof handle, () => Promise<{ value: number }>>>;

  expect(await handle()).toStrictEqual({ value: 3 });
});

test("OutputTypeMiddleware narrows the success branch of a union", async () => {
  const handle = new Pipe(PassThrough)
    .use(OutputTypeMiddleware<SuccessOrError>)
    .handle(async () => ({ status: "success", data: 3 }));
  type TEST = Expect<IsEqual<typeof handle, () => Promise<{ status: "success"; data: number }>>>;

  expect(await handle()).toStrictEqual({ status: "success", data: 3 });
});

test("OutputTypeMiddleware narrows the error branch of a union", async () => {
  const handle = new Pipe(PassThrough)
    .use(OutputTypeMiddleware<SuccessOrError>)
    .handle(async () => ({ status: "error", error: 3 }));
  type TEST = Expect<IsEqual<typeof handle, () => Promise<{ status: "error"; error: number }>>>;

  expect(await handle()).toStrictEqual({ status: "error", error: 3 });
});

test("success/error helpers infer through OutputTypeMiddleware", async () => {
  const handle = new Pipe(PassThrough)
    .use(OutputTypeMiddleware<SuccessOrError>)
    .handle(successOrErrorHandler);
  type TEST = Expect<IsEqual<typeof handle, SuccessOrErrorResult>>;

  await expectHey(handle);
});

test("success/error helpers infer with a trailing passthrough", async () => {
  const handle = new Pipe(PassThrough)
    .use(OutputTypeMiddleware<SuccessOrError>)
    .use(PassThrough)
    .handle(successOrErrorHandler);
  type TEST = Expect<IsEqual<typeof handle, SuccessOrErrorResult>>;

  await expectHey(handle);
});

test("handle return type is enforced by OutputTypeMiddleware", () => {
  // @ts-expect-error handle return type should be a string
  const h1 = new Pipe(PassThrough).use(OutputTypeMiddleware<string>).handle(async () => 3);

  const h2 = new Pipe(PassThrough)
    .use(OutputTypeMiddleware<SuccessOrError>)
    // @ts-expect-error handle return type should be the success/error union
    .handle(async () => 3);

  expect(h1).toBeTypeOf("function");
  expect(h2).toBeTypeOf("function");
});

test("entry args become the handler's call signature", async () => {
  const pipe1 = new Pipe(entry((req: Request) => ({ req })));
  const pipe2 = pipe1.use(AddUserFromRequest);
  const handle = pipe2.handle(async ({ req }) => "yo" as const);

  type TEST = Expect<IsEqual<typeof handle, (req: Request) => Promise<"yo">>>;

  expect(await handle(new Request("http://localhost"))).toBe("yo");
});

test("use() requires upstream-provided context", () => {
  class AddRandom extends BeforeMiddleware {
    async before() {
      return next({ value: 2 });
    }
  }
  class CheckPermission extends BeforeMiddleware {
    async before(arg: { user: { id: string } }) {
      if (arg.user.id != "pouet") return interrupt("error");
      else return next({});
    }
  }

  // @ts-expect-error missing user
  const p2 = createPipe().use(CheckPermission);
  // @ts-expect-error user is missing
  const p3 = createPipe().use(AddRandom).use(CheckPermission);

  expect(p2).toBeInstanceOf(Pipe);
  expect(p3).toBeInstanceOf(Pipe);
});

test("handle accepts any subset of the accumulated input shape", async () => {
  const pipe = new Pipe(entry((req: Request) => ({ req }))).use(AddUserFromRequest);

  pipe.handle(async () => "yo" as const);
  pipe.handle(async ({ req, user }) => "yo" as const);
  pipe.handle(async (input: { req: Request; user: { id: string } }) => "yo" as const);
  // @ts-expect-error req2 does not exist in the chain
  pipe.handle(async (input: { req2: Request; user: { id: string } }) => "yo" as const);
  // @ts-expect-error user.name does not existing in the chain
  pipe.handle(async (input: { req: Request; user: { id: string; name: string } }) => "yo" as const);

  type Handle = typeof pipe.handle;
  type HandleParam = Parameters<Parameters<Handle>[0]>[0];
  type TEST = Expect<
    IsEqual<
      HandleParam,
      {
        req: Request;
        user: {
          id: string;
        };
      }
    >
  >;

  const handle = pipe.handle(async ({ user }) => user.id);
  expect(await handle(new Request("http://localhost"))).toBe("string");
});

test("entry without after-middleware keeps the raw call signature", async () => {
  const handle = new Pipe(entry((req: Request) => ({ req }))).use(M1).handle(async () => "yo");
  type TEST = Expect<IsEqual<Parameters<typeof handle>, [req: Request]>>;

  expect(await handle(new Request("http://localhost"))).toStrictEqual({ value: "yo" });
});

test("after middlewares must chain compatibly", () => {
  // @ts-expect-error First M2 expects {value:string} but second M2 sends {value2:string}
  const pipe = new Pipe(PassThrough).use(M2).use(M2);

  expect(pipe).toBeInstanceOf(Pipe);
});

test("a single after middleware reshapes the handler return", async () => {
  const handle = new Pipe(PassThrough).use(M1).handle(returnYo);
  type TEST = Expect<IsEqual<typeof handle, YoValue>>;

  await expectYoValue(handle);
});

test("handler return must satisfy the after middleware's input", () => {
  // @ts-expect-error Handle should return a react node middleware
  const handle = new Pipe(PassThrough).use(ReactNodeMiddleware).handle(async () => new Date());

  expect(handle).toBeTypeOf("function");
});

test("after middlewares run outermost-first (onion)", async () => {
  const handle = new Pipe(PassThrough)
    .use(M2)
    .use(M1)
    .handle(async () => "yo" as const);
  type TEST = Expect<IsEqual<typeof handle, () => Promise<{ value2: "yo" }>>>;

  expect(await handle()).toStrictEqual({ value2: "yo" });
});

test("an inline after middleware composes with the chain", async () => {
  const handle = new Pipe(PassThrough)
    .use(M2)
    .use(M1)
    .use(
      class extends AfterMiddleware {
        async after(t: this["After"]) {
          return typeof t;
        }
      },
    )
    .handle(async () => "yo" as const);
  type TEST = Expect<
    IsEqual<
      typeof handle,
      () => Promise<{
        value2:
          | "string"
          | "number"
          | "bigint"
          | "boolean"
          | "symbol"
          | "undefined"
          | "object"
          | "function";
      }>
    >
  >;

  // typeof "yo" -> "string" -> M1.after -> { value: "string" } -> M2.after
  expect(await handle()).toStrictEqual({ value2: "string" });
});

test("an after middleware can be the root of the pipe", async () => {
  const handle = new Pipe(M1).handle(returnYo);
  type TEST = Expect<IsEqual<typeof handle, YoValue>>;

  await expectYoValue(handle);
});

test("a passthrough root returns the handler value unchanged", async () => {
  const handle = new Pipe(PassThrough).handle(async () => "yo" as const);
  type TEST = Expect<IsEqual<typeof handle, () => Promise<"yo">>>;

  expect(await handle()).toBe("yo");
});

test("single-argument error wraps the value as the error payload", () => {
  expect(error("boom")).toStrictEqual({ status: "error", error: "boom" });
  expect(error({ code: 42 })).toStrictEqual({ status: "error", error: { code: 42 } });
});

test("keyed error with an undefined payload keeps the keyed shape its type declares", () => {
  const e = error("unauthorized", undefined);
  type TEST = Expect<
    IsEqual<typeof e, { status: "error"; error: { type: "unauthorized"; data: undefined } }>
  >;

  // Arity, not `data !== undefined`, picks the form — otherwise this degraded
  // to `{ error: "unauthorized" }` at runtime while the type said `{ type, data }`.
  expect(e).toStrictEqual({ status: "error", error: { type: "unauthorized", data: undefined } });
});

/**
 * `merge`'s body is an assertion, so its declared type holds whatever the body
 * does — only the runtime expectation below can catch a reversed spread.
 */
test("merge lets the right operand win, in the value as well as the type", () => {
  const merged = merge({ a: 1, b: "x" }, { b: 2, c: true });
  type TEST = Expect<IsEqual<typeof merged, { a: number; b: number; c: boolean }>>;

  expect(merged).toStrictEqual({ a: 1, b: 2, c: true });
});

test("a middleware that branches its next() shadows keys per branch", async () => {
  class Branching extends BeforeMiddleware {
    async before(arg: { id: string }) {
      if (arg.id === "") return next({ id: 0 });
      return next({ tenant: "acme" as const });
    }
  }

  const pipe = new Pipe(entry((id: string) => ({ id }))).use(Branching);
  type HandleParam = Parameters<Parameters<typeof pipe.handle>[0]>[0];
  // Each branch overrides `id` on its own. Merging the union as a whole instead
  // would intersect the shadowed key across every member — `id: string & number`
  // — and silently hand the handler an `id: never`.
  type TEST = Expect<IsEqual<HandleParam, { id: number } | { id: string; tenant: "acme" }>>;

  const handle = pipe.handle(async (arg) => ("tenant" in arg ? arg.tenant : arg.id));
  expect(await handle("")).toBe(0);
  expect(await handle("x")).toBe("acme");
});
