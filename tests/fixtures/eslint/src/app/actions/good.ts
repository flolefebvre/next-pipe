"use server";

import { actionPipe, formActionPipe } from "../pipe";
import { AdminMiddleware } from "@/lib/middlewares";

export const deleteNote = actionPipe.use(AdminMiddleware).handle(async () => undefined);

export const submitNote = formActionPipe.handle(async () => undefined);
