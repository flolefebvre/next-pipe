import { pagePipe as basePagePipe } from "../pipe";
import { AdminMiddleware } from "@/lib/middlewares";

export const pagePipe = basePagePipe.use(AdminMiddleware);
