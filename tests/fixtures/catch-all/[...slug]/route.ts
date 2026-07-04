import { routePipe } from "../../../../src/pipes/route-pipe.js";
import { json } from "../../../../src/helpers.js";

// The idiomatic shape: `export const GET = pipe.handle(...)`, here under a
// catch-all segment. Usable like any other pipe-backed route.
export const GET = routePipe().handle(async () => json(200, "catch-all"));
