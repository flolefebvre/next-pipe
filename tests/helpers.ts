type ShapesMatch<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

type TypesMatch<T, U> = ShapesMatch<T, U> extends true ? (ShapesMatch<keyof T, keyof U> extends true ? true : false) : false;

type Expect<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Not<T extends false> = true;

// fallow-ignore-next-line unused-type
export type { TypesMatch, Expect, Not };
