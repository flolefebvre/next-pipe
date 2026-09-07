import { routePipe } from "@flefebvre/next-pipe/pipes";

export const GET = routePipe().handle(async () => ({ status: 200 }) as const);
