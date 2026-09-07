import { routePipe } from "../pipe";
import { routePipe as baseRoutePipe } from "@flefebvre/next-pipe/pipes";
import { AdminMiddleware } from "@/lib/middlewares";

export const GET = routePipe.use(AdminMiddleware).handle(async () => ({ status: 200 }) as const);

export const POST = baseRoutePipe().handle(async () => ({ status: 201 }) as const);
