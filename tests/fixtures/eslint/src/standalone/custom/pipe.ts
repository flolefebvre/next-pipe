import { Pipe, entry } from "@flefebvre/next-pipe/server";

// Nothing above exports `pagePipe`, so this file may root its pipe anywhere —
// here in the `/server` primitives rather than in a parent `pipe.ts`.
export const pagePipe = new Pipe(entry());
