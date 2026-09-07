// Keep this module free of any `src/` import — `tests/dist-consumer/**`
// imports it, and that fixture must resolve the package through `dist` only.
// `scripts/typecheck-dist.mjs` fails the moment its program reads a `src/`
// file. Shared fixtures that need `src/` live in `./unit-fixtures.ts`.

type ShapesMatch<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

type TypesMatch<T, U> = ShapesMatch<T, U> extends true ? (ShapesMatch<keyof T, keyof U> extends true ? true : false) : false;

type Expect<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Not<T extends false> = true;

export type { TypesMatch, Expect, Not };
