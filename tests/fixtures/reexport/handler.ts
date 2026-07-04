import { routePipe } from "../../../src/pipes/route-pipe.js";
import { json } from "../../../src/helpers.js";

// A usable handler living in its own file; `route.ts` re-exports it.
export const GET = routePipe().handle(async () => json(200, "reexport"));
