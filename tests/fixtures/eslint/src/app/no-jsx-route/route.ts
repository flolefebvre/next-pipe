import { routePipe } from "@/app/pipe";

export const GET = routePipe.handle(async () => ({ status: 200 }) as const);
