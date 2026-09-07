import {
  pagePipe as basePagePipe,
  layoutPipe as baseLayoutPipe,
  templatePipe as baseTemplatePipe,
  routePipe as baseRoutePipe,
  actionPipe as baseActionPipe,
  formActionPipe as baseFormActionPipe,
} from "@flefebvre/next-pipe/pipes";
import { AuthMiddleware } from "@/lib/middlewares";

export type AppUser = { username: string };

export const pagePipe = basePagePipe().use(AuthMiddleware);
export const layoutPipe = baseLayoutPipe().use(AuthMiddleware);
export const templatePipe = baseTemplatePipe().use(AuthMiddleware);
export const routePipe = baseRoutePipe().use(AuthMiddleware);
export const actionPipe = baseActionPipe().use(AuthMiddleware);
export const formActionPipe = baseFormActionPipe().use(AuthMiddleware);
