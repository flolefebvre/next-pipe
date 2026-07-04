import { routePipe } from "../../../src/pipes/route-pipe.js";
import { json } from "../../../src/helpers.js";

// A `function` declaration (not an `export const`) that delegates to a pipe.
// Its inferred return type carries the pipe's `__MIDDLEWARE_CONFIG.output`.
const handler = routePipe().handle(async () => json(200, "delegated"));

export async function GET(req: Request) {
  return handler(req, null as unknown as never);
}
