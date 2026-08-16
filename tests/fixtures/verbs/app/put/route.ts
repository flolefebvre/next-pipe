import { routePipe } from "../../../../../src/pipes/route-pipe.js";
import { json } from "../../../../../src/helpers.js";

// One pipe-backed route per verb, so `next-pipe gen` emits one generated
// module per verb and each can be parsed in isolation.
export const PUT = routePipe().handle(async () => json(200, "PUT"));
