import type { ExtendsStrict, If, IsEqual, Merge } from "type-fest";

type Assume<T, U> = T extends U ? T : U;

/**
 * type-fest's `Merge`, not a local `Omit<T1, keyof T2> & T2`: `Omit` is not
 * distributive, so merging into a union kept only the keys common to every
 * member — collapsing a multi-branch result to a bare discriminant carrying no
 * payload (#10). Both operands distribute, so each member merges on its own.
 *
 * The cast is required: while `T1`/`T2` are generic the distribution stays
 * deferred, and TS will not accept the spread's `T1 & T2` as satisfying it. It
 * also leaves the body unchecked, so the declared type holds whatever the
 * spread does — the runtime assertion in `core.test.ts` is the only guard on
 * the operand order.
 */
function merge<T1, T2>(obj1: T1, obj2: T2): Merge<T1, T2> {
  return { ...obj1, ...obj2 } as Merge<T1, T2>;
}

abstract class Middleware<T = unknown> {
  readonly _RawAfterType = null as unknown;
  readonly After = null as unknown as Assume<this["_RawAfterType"], T>;
  abstract before(
    input: object,
  ): Promise<{ next: Record<string, unknown> } | { interrupt: unknown }>;
  abstract after(t: this["After"]): Promise<unknown>;

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  declare config: {};
}

class PassThrough extends Middleware {
  async before() {
    return next({});
  }
  async after(t: this["After"]) {
    return t;
  }
}

abstract class BeforeMiddleware extends Middleware {
  async after(t: this["After"]) {
    return t;
  }
}

abstract class AfterMiddleware<T = unknown> extends Middleware<T> {
  async before() {
    return next({});
  }
}

type Apply<TMiddleware extends Middleware, TType> = ReturnType<
  (TMiddleware & { _RawAfterType: TType })["after"]
>;
type ApplyConfig<TMiddleware extends Middleware, TType> = (TMiddleware & {
  _RawAfterType: TType;
})["config"];
type InterruptOf<T extends Middleware> = Extract<
  Awaited<ReturnType<T["before"]>>,
  { interrupt: unknown }
>["interrupt"];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const __brand: unique symbol;
type IsIdentity<T extends Middleware> = IsEqual<typeof __brand, Awaited<Apply<T, typeof __brand>>>;

type MiddlewareShape<
  T extends Middleware,
  TBeforeInput = unknown,
  TBeforeOutput = unknown,
  TAfterOutput = unknown,
> = If<
  IsIdentity<T>,
  { after: T["after"] },
  {
    after(input: unknown): Promise<TAfterOutput>;
  }
> & {
  before: (input: TBeforeInput) => Promise<TBeforeOutput>;
};

/**
 * Not `Parameters<T["before"]>[0]`: that conflates "takes no argument" with
 * `undefined`, which fails `Middleware`'s `before(input: object)` once emitted
 * (#9). The `& object` is load-bearing too — while `T` is generic the
 * conditional is deferred, and a deferred conditional is not accepted as
 * satisfying `object`.
 */
type BeforeInput<T extends Middleware> = (Parameters<T["before"]> extends [infer P, ...unknown[]]
  ? P
  : object) &
  object;

type GetRawInput<T> = T extends { rawInput: infer R extends unknown[] } ? R : [];
type GetRawInputFromMiddleware<T extends Middleware> = GetRawInput<BeforeInput<T>>;

function interrupt<T>(value: T) {
  return { interrupt: value };
}

function next<T extends Record<string, unknown>>(value: T) {
  return { next: value };
}

export const __MIDDLEWARE_CONFIG = Symbol();

abstract class ComposedMiddleware<
  TFn extends Middleware,
  TMiddleware extends Middleware,
> extends Middleware<
  If<IsIdentity<TMiddleware>, Parameters<TFn["after"]>[0], Parameters<TMiddleware["after"]>[0]>
> {
  constructor(
    private fn: TFn,
    private middleware: TMiddleware,
  ) {
    super();
  }

  async before(input: BeforeInput<TFn>) {
    const before = (await this.fn.before(input)) as Awaited<ReturnType<TFn["before"]>>;

    if ("next" in before) {
      const nextValue = before.next as Extract<
        Awaited<ReturnType<TFn["before"]>>,
        { next: unknown }
      >["next"];

      const middlewareCall = (await this.middleware.before(nextValue)) as Awaited<
        ReturnType<TMiddleware["before"]>
      >;

      if ("next" in middlewareCall) {
        const middlewareNextValue = middlewareCall.next as Extract<
          Awaited<ReturnType<TMiddleware["before"]>>,
          { next: unknown }
        >["next"];

        const m = merge(nextValue, middlewareNextValue);
        return next(m);
      } else {
        const interruptValue = middlewareCall.interrupt as Extract<
          Awaited<ReturnType<TMiddleware["before"]>>,
          { interrupt: unknown }
        >["interrupt"];

        const interruptValueThroughAfter = (await this.fn.after(interruptValue)) as Awaited<
          Apply<typeof this.fn, typeof interruptValue>
        >;

        return interrupt(interruptValueThroughAfter) as If<
          IsEqual<typeof interruptValue, never>,
          never,
          ReturnType<typeof interrupt<typeof interruptValueThroughAfter>>
        >;
      }
    } else {
      return before as Extract<Awaited<ReturnType<TFn["before"]>>, { interrupt: unknown }>;
    }
  }

  async after(
    t: this["After"],
  ): Promise<Awaited<Apply<TFn, Awaited<Apply<TMiddleware, this["After"]>>>>> {
    const newValue = (await this.middleware.after(t)) as Awaited<Apply<TMiddleware, typeof t>>;
    return (await this.fn.after(newValue)) as Awaited<Apply<typeof this.fn, typeof newValue>>;
  }

  declare config: ApplyConfig<TMiddleware, this["After"]> &
    ApplyConfig<TFn, this["After"] | InterruptOf<TMiddleware>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class Pipe<TFn extends Middleware, TFnConstructor extends { new (...args: any[]): TFn }> {
  private fnArgs: ConstructorParameters<TFnConstructor>;
  constructor(
    private fn: TFnConstructor & {
      new (...args: ConstructorParameters<TFnConstructor>): TFn;
    },
    ...fnArgs: ConstructorParameters<TFnConstructor>
  ) {
    this.fnArgs = fnArgs;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use<TMiddleware extends Middleware, const TConstructorArgs extends any[]>(
    middleware: {
      new (
        ...args: TConstructorArgs
      ): TMiddleware &
        MiddlewareShape<
          TMiddleware,
          Extract<Awaited<ReturnType<TFn["before"]>>, { next: unknown }>["next"],
          { interrupt: Parameters<TFn["after"]>[0] } | { next: unknown },
          Parameters<TFn["after"]>[0]
        >;
    },
    ...args: TConstructorArgs
  ): Pipe<ComposedMiddleware<TFn, TMiddleware>, new () => ComposedMiddleware<TFn, TMiddleware>> {
    const parentFn = this.fn;
    const parentConstructorArguments = this.fnArgs;
    return new Pipe(
      class extends ComposedMiddleware<TFn, TMiddleware> {
        constructor() {
          super(new parentFn(...parentConstructorArguments), new middleware(...args));
        }
      },
    );
  }

  handle<T extends Parameters<TFn["after"]>[0]>(
    handler: (
      arg: Extract<Awaited<ReturnType<TFn["before"]>>, { next: Record<string, unknown> }>["next"],
    ) => Promise<T>,
  ) {
    type Input = GetRawInputFromMiddleware<TFn>;
    const fn = this.fn;
    const fnArgs = this.fnArgs;
    const theHandler = async function (...args: Input) {
      const middleware = new fn(...fnArgs);
      const beforeResult = await middleware.before({ rawInput: args });

      type Config = If<
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        IsEqual<TFn["config"], {}>,
        unknown,
        { [__MIDDLEWARE_CONFIG]: ApplyConfig<TFn, T> }
      >;
      if ("interrupt" in beforeResult)
        return beforeResult.interrupt as Extract<
          Awaited<ReturnType<TFn["before"]>>,
          { interrupt: unknown }
        >["interrupt"] &
          Config;
      const res = await handler(beforeResult.next);
      // returns never if the handler does not actually return (always throw)
      return (await middleware.after(res)) as If<
        ExtendsStrict<T, never>,
        never,
        Awaited<Apply<typeof middleware, T>>
      > &
        Config;
    };

    return theHandler;
  }
}

function createPipe() {
  return new Pipe(PassThrough);
}

function entry<T extends unknown[], U extends Record<string, unknown>>(
  fn: (...args: T) => U,
): new () => BeforeMiddleware & {
  before(input: { rawInput: T }): Promise<{ next: U }>;
} {
  return class extends BeforeMiddleware {
    async before(input: { rawInput: T }) {
      return next(fn(...input.rawInput));
    }
  };
}

// SUCCESS - ERROR
function success(): { status: "success"; data: undefined };
function success<T>(value: T): { status: "success"; data: T };
function success<T>(value?: T) {
  return { status: "success" as const, data: value };
}

function error<T>(value: T): { status: "error"; error: T };
function error<TKey extends string, TData>(
  key: TKey,
  data: TData,
): { status: "error"; error: { type: TKey; data: TData } };

function error(...args: [value: unknown] | [key: string, data: unknown]) {
  // Discriminate on arity, not on `data !== undefined`: `error("key", undefined)`
  // is the two-argument (keyed) form and must yield `{ type, data: undefined }`,
  // as its overload declares — not the bare-value shape.
  if (args.length === 2) {
    const [type, data] = args;
    return { status: "error" as const, error: { type, data } };
  }
  return { status: "error" as const, error: args[0] };
}

type ActionSuccess<T = unknown> = { status: "success"; data: T };
type ActionError<TKey extends string, TData> = {
  status: "error";
  error: { type: TKey; data: TData };
};
type ActionResult<TSuccessData = unknown, TErrorKey extends string = string, TErrorData = unknown> =
  ActionSuccess<TSuccessData> | ActionError<TErrorKey, TErrorData>;

type MiddlewareConfig<key extends string, value> = Record<key, value>;

export { Pipe, Middleware, ComposedMiddleware, BeforeMiddleware, AfterMiddleware, PassThrough };
export { entry, next, interrupt, success, error, createPipe, merge };
export type { Apply, ActionSuccess, ActionError, ActionResult, MiddlewareConfig };
