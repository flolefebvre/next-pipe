"use client";

import { type FormEvent, useActionState, useLayoutEffect, useRef, useState } from "react";
import { getActionInput } from "./client-helpers.js";

type FormActionSuccess = { status: "success"; data: unknown };

type FormActionError = { status: "error"; error: { type: string; data: unknown } };

type FormActionResult = FormActionSuccess | FormActionError;

type SuccessResult<Result extends FormActionResult> = Extract<Result, FormActionSuccess>;

/**
 * Indexed through the full error shape, not `{ status: "error" }`: the looser
 * extract makes `error.data` collapse to `unknown` at the call site.
 */
type ErrorResult<Result extends FormActionResult> = Extract<Result, FormActionError>;

/**
 * What the form does when its page is hidden (the user navigated away):
 * - `"keep"` (the default): nothing, the page's visit policy decides;
 * - `"clearResult"`: drop the result (messages, errors), keep what was typed;
 * - `"reset"`: drop the result and blank every field.
 */
type LeavePolicy = "keep" | "clearResult" | "reset";

type FormActionOptions<Result extends FormActionResult> = {
  /** Runs once per successful result, never again when the page is shown. */
  onSuccess?: (result: SuccessResult<Result>) => void;
  /** Runs once per error result, never again when the page is shown. */
  onError?: (result: ErrorResult<Result>) => void;
  onLeave?: LeavePolicy;
};

type FormAction<Result extends FormActionResult> = {
  /** Put on the `<form>` as `key`: `onLeave: "reset"` remounts the form through it. */
  formKey: number;
  /** Spread onto the `<form>`. */
  formProps: {
    action: (formData: FormData) => void;
    onReset: (event: FormEvent<HTMLFormElement>) => void;
  };
  /** The echoed input of an error result, for `defaultValue`; `null` otherwise. */
  input: ReturnType<typeof getActionInput<ErrorResult<Result>>>;
  /** The error of an error result, narrowed by `error?.type`; `null` otherwise. */
  error: ErrorResult<Result>["error"] | null;
  isPending: boolean;
  /** The latest result, or `null` before the first one and once `onLeave` dropped it. */
  result: Result | null;
};

/**
 * The server render hands `useActionState` the server action itself, so the
 * form it renders still submits without JavaScript (progressive enhancement):
 * React only renders a no-JS form for a server action, not for the client
 * wrapper that runs the callbacks. The browser always uses the wrapper.
 */
const isServerRender = typeof window === "undefined";

function isSuccess<Result extends FormActionResult>(
  result: Result,
): result is SuccessResult<Result> {
  return result.status === "success";
}

function isError<Result extends FormActionResult>(
  result: Result | null,
): result is ErrorResult<Result> {
  return result?.status === "error";
}

/**
 * `useActionState` for a `formActionPipe` action, made to behave when Next
 * hides the page in `<Activity>` and shows it again:
 * - `onSuccess` and `onError` run from the dispatch wrapper, once per result.
 *   An effect on the result would run again on every return to the page.
 * - After anything but a success, React's automatic form reset is cancelled
 *   (React >= 19.3), so every field keeps what the user typed, `<select>`
 *   included. A success resets the form.
 * - `onLeave` clears the result, or the whole form, when the page is hidden.
 *   A result that arrives while the page is hidden is then dropped; its
 *   callback still runs.
 * - The form still submits without JavaScript: see `isServerRender`.
 */
function useFormAction<Result extends FormActionResult>(
  action: (previousResult: unknown, formData: FormData) => Promise<Result>,
  options: FormActionOptions<Result> = {},
): FormAction<Result> {
  const latestOptionsRef = useRef(options);
  const isHiddenRef = useRef(false);
  const [formKey, setFormKey] = useState(0);
  const formKeyRef = useRef(formKey);
  const keptFormKeyRef = useRef<number | null>(null);
  const [dismissedResult, setDismissedResult] = useState<Result | null>(null);

  async function settle(previousResult: Result | null, formData: FormData) {
    const submittedFormKey = formKeyRef.current;
    const nextResult = await action(previousResult, formData);
    const { onSuccess, onError, onLeave = "keep" } = latestOptionsRef.current;
    keptFormKeyRef.current = isSuccess(nextResult) ? null : submittedFormKey;
    if (isSuccess(nextResult)) onSuccess?.(nextResult);
    if (isError(nextResult)) onError?.(nextResult);
    const isDroppedWhileHidden = isHiddenRef.current && onLeave !== "keep";
    return isDroppedWhileHidden ? null : nextResult;
  }

  const [settledResult, dispatch, isPending] = useActionState<Result | null, FormData>(
    isServerRender ? action : settle,
    null,
  );
  const latestSettledResultRef = useRef(settledResult);

  useLayoutEffect(() => {
    latestOptionsRef.current = options;
    latestSettledResultRef.current = settledResult;
    formKeyRef.current = formKey;
  });

  useLayoutEffect(() => {
    isHiddenRef.current = false;
    return () => {
      isHiddenRef.current = true;
      const { onLeave = "keep" } = latestOptionsRef.current;
      if (onLeave === "keep") return;
      setDismissedResult(latestSettledResultRef.current);
      if (onLeave === "reset") setFormKey((previousFormKey) => previousFormKey + 1);
    };
  }, []);

  function keepFieldsAfterFailedSubmission(event: FormEvent<HTMLFormElement>) {
    if (keptFormKeyRef.current === formKeyRef.current) event.preventDefault();
    keptFormKeyRef.current = null;
  }

  const result = settledResult === dismissedResult ? null : settledResult;
  const errorResult = isError(result) ? result : null;

  return {
    formKey,
    formProps: { action: dispatch, onReset: keepFieldsAfterFailedSubmission },
    input: getActionInput(errorResult),
    error: errorResult?.error ?? null,
    isPending,
    result,
  };
}

export { useFormAction };
export type { LeavePolicy, FormActionOptions };
