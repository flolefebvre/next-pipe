/**
 * `useFormAction`, resolved through the built `dist`.
 */

import z from "zod";
import type { IsAny, IsEqual } from "type-fest";
import type { Expect, Not } from "../helpers.js";
import { formActionPipe } from "@flefebvre/next-pipe/pipes";
import { error, success } from "@flefebvre/next-pipe/server";
import { useFormAction } from "@flefebvre/next-pipe/client";
import type { FormActionOptions, LeavePolicy } from "@flefebvre/next-pipe/client";

const createNote = formActionPipe(z.object({ title: z.string(), body: z.string() })).handle(
  async ({ input }) => {
    if (input.title === "taken") return error("titleTaken", "That title is taken" as const);
    return success({ id: 1 });
  },
);

type CreateNoteResult = Awaited<ReturnType<typeof createNote>>;

/* --- useFormAction --- */

type LeavePolicyIsTyped = Expect<IsEqual<LeavePolicy, "keep" | "clearResult" | "reset">>;

const options: FormActionOptions<CreateNoteResult> = {
  onSuccess: (result) => {
    type OnSuccessGetsTheSuccess = Expect<IsEqual<typeof result.data, { id: number }>>;
  },
  onLeave: "reset",
};

const form = useFormAction(createNote, options);

type FormKeyIsNumber = Expect<IsEqual<typeof form.formKey, number>>;
type InputIsNotAny = Expect<Not<IsAny<typeof form.input>>>;
type InputIsTheErrorEcho = Expect<
  IsEqual<typeof form.input, { title?: string | undefined; body?: string | undefined } | null>
>;
type ResultIsTheUnion = Expect<IsEqual<typeof form.result, CreateNoteResult | null>>;
type FormActionTakesFormData = Expect<
  IsEqual<Parameters<typeof form.formProps.action>, [formData: FormData]>
>;

const titleTaken = form.error?.type === "titleTaken" ? form.error.data : null;
type ErrorNarrowsByType = Expect<IsEqual<typeof titleTaken, "That title is taken" | null>>;

export { createNote, options, form, titleTaken };
