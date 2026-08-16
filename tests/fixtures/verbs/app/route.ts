import { routePipe } from "../../../../src/pipes/route-pipe.js";
import { json } from "../../../../src/helpers.js";

// The root route: its generated module cannot mirror its (empty) route dir,
// since `index.ts` is the barrel — it must land in `_root.ts` and be imported
// from there.
export const GET = routePipe().handle(async () => json(200, "root"));
