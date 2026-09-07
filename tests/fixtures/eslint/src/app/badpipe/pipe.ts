import { pagePipe as basePagePipe } from "../pipe";

export type Options = { strict: boolean };

export const pagePipe = basePagePipe;

export const helper = () => "not a pipe";

export default helper;
