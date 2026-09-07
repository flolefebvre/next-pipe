"use server";

import { actionPipe as baseActionPipe } from "@flefebvre/next-pipe/pipes";

export async function deleteNote() {
  return undefined;
}

export const createNote = baseActionPipe().handle(async () => undefined);
