import { act, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useActionState } from "react";
import { describe, expect, test, vi } from "vitest";
import * as z from "zod";
import { deferred } from "../tests/deferred.js";
import { renderInActivity } from "../tests/render-in-activity.js";
import { getActionInput } from "./client-helpers.js";
import { error, success } from "./core.js";
import type { FormEcho } from "./middlewares/form-actions/form-validation-middleware.js";
import { formActionPipe } from "./pipes/form-action-pipe.js";
import { type LeavePolicy, useFormAction } from "./use-form-action.js";

const noteSchema = z.object({
  title: z.string().nonempty(),
  category: z.enum(["work", "home", "travel"]),
});

function createNoteAction({
  isHeldUntilReleased,
  echo,
}: {
  isHeldUntilReleased: boolean;
  echo: FormEcho;
}) {
  const { promise: release, resolve: releaseSubmission } = deferred<void>();
  const createNote = formActionPipe(noteSchema, { echo }).handle(async ({ input }) => {
    if (isHeldUntilReleased) await release;
    if (input.title === "Taken") return error("titleTaken", "That title is taken");
    return success({ id: 1 });
  });
  return { createNote, releaseSubmission };
}

type CreateNote = ReturnType<typeof createNoteAction>["createNote"];

function NoteFields({
  echoedInput,
}: {
  echoedInput: { title?: string; category?: string } | null | undefined;
}) {
  return (
    <>
      <label>
        Title
        <input name="title" defaultValue={echoedInput?.title} />
      </label>
      <label>
        Category
        <select name="category" defaultValue={echoedInput?.category ?? "work"}>
          <option value="work">Work</option>
          <option value="home">Home</option>
          <option value="travel">Travel</option>
        </select>
      </label>
      <button type="submit">Save</button>
      <button type="reset">Clear</button>
    </>
  );
}

type NoteFormProps = {
  createNote: CreateNote;
  onSuccess?: () => void;
  onError?: () => void;
  onLeave?: LeavePolicy;
};

function NoteForm({ createNote, onSuccess, onError, onLeave }: NoteFormProps) {
  const { formKey, formProps, input, error, isPending, result } = useFormAction(createNote, {
    onSuccess,
    onError,
    onLeave,
  });

  return (
    <form key={formKey} {...formProps} aria-busy={isPending}>
      <NoteFields echoedInput={input} />
      {error?.type === "titleTaken" && <p role="alert">{error.data}</p>}
      {result?.status === "success" && <p role="status">Saved</p>}
    </form>
  );
}

function UnguardedNoteForm({ createNote }: { createNote: CreateNote }) {
  const [result, dispatch, isPending] = useActionState(createNote, null);

  return (
    <form action={dispatch} aria-busy={isPending}>
      <NoteFields echoedInput={getActionInput(result)} />
      {result?.status === "error" && <p role="alert">Failed</p>}
    </form>
  );
}

type RenderOptions = Omit<NoteFormProps, "createNote"> & {
  isStrictMode?: boolean;
  isHeldUntilReleased?: boolean;
  isUnguarded?: boolean;
  echo?: FormEcho;
};

function renderNoteForm({
  isStrictMode = false,
  isHeldUntilReleased = false,
  isUnguarded = false,
  echo = "onError",
  ...noteFormProps
}: RenderOptions = {}) {
  const { createNote, releaseSubmission } = createNoteAction({ isHeldUntilReleased, echo });
  const ui = isUnguarded ? (
    <UnguardedNoteForm createNote={createNote} />
  ) : (
    <NoteForm createNote={createNote} {...noteFormProps} />
  );
  return { ...renderInActivity(ui, { isStrictMode }), releaseSubmission };
}

async function fillNote(title: string, category: string) {
  const user = userEvent.setup();
  if (title) await user.type(screen.getByLabelText("Title"), title);
  await user.selectOptions(screen.getByLabelText("Category"), category);
  return user;
}

async function submitNote(title: string, category: string) {
  const user = await fillNote(title, category);
  await user.click(screen.getByRole("button", { name: "Save" }));
  return user;
}

async function submitTakenNote() {
  const user = await submitNote("Taken", "home");
  await screen.findByRole("alert");
  return user;
}

async function waitForSubmissionToSettle() {
  await waitFor(() =>
    expect(document.querySelector("form")?.getAttribute("aria-busy")).toBe("false"),
  );
}

function fieldValues() {
  return {
    title: (screen.getByLabelText("Title") as HTMLInputElement).value,
    category: (screen.getByLabelText("Category") as HTMLSelectElement).value,
  };
}

describe("React baseline without the hook", () => {
  test("an error resets the select to its first default despite the echoed defaultValue", async () => {
    renderNoteForm({ isUnguarded: true });

    await submitTakenNote();

    expect(fieldValues()).toEqual({ title: "Taken", category: "work" });
  });

  test("with echo: always, a success refills the fields it should clear", async () => {
    renderNoteForm({ isUnguarded: true, echo: "always" });

    await submitNote("Groceries", "home");

    await waitForSubmissionToSettle();
    expect(fieldValues()).toEqual({ title: "Groceries", category: "work" });
  });

  test("with the default echo, a success clears the fields", async () => {
    renderNoteForm({ isUnguarded: true });

    await submitNote("Groceries", "home");

    await waitForSubmissionToSettle();
    expect(fieldValues()).toEqual({ title: "", category: "work" });
  });

  test("a transition cannot hide the form while its submission is pending", async () => {
    const view = renderNoteForm({ isUnguarded: true, isHeldUntilReleased: true });
    await submitNote("Taken", "home");

    await view.hide({ isTransition: true });

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeNull();
    view.releaseSubmission();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
  });
});

describe("submitting", () => {
  test("an error keeps every field, select included", async () => {
    renderNoteForm();

    await submitTakenNote();

    expect(fieldValues()).toEqual({ title: "Taken", category: "home" });
  });

  test("a validation error keeps every field, select included", async () => {
    renderNoteForm();

    await submitNote("", "travel");

    await waitForSubmissionToSettle();
    expect(fieldValues()).toEqual({ title: "", category: "travel" });
  });

  test("a success with no redirect clears the fields", async () => {
    renderNoteForm();

    await submitNote("Groceries", "home");

    await screen.findByRole("status");
    expect(fieldValues()).toEqual({ title: "", category: "work" });
  });

  test("a success after an error clears the fields", async () => {
    renderNoteForm();
    const user = await submitTakenNote();

    await user.type(screen.getByLabelText("Title"), " twice");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("status");
    expect(fieldValues()).toEqual({ title: "", category: "work" });
  });

  test("a reset button is not cancelled after an error", async () => {
    renderNoteForm();
    const user = await submitTakenNote();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(fieldValues().category).toBe("work");
  });
});

describe.each([false, true])("callbacks (StrictMode: %s)", (isStrictMode) => {
  test("onSuccess fires once and not again after hide and show", async () => {
    const onSuccess = vi.fn();
    const view = renderNoteForm({ onSuccess, isStrictMode });
    await submitNote("Groceries", "home");
    await screen.findByRole("status");

    await view.hide();
    await view.show();

    expect(onSuccess).toHaveBeenCalledOnce();
  });

  test("onError fires once with the error result", async () => {
    const onError = vi.fn();
    const view = renderNoteForm({ onError, isStrictMode });
    await submitTakenNote();

    await view.hide();
    await view.show();

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        status: "error",
        error: { type: "titleTaken", data: "That title is taken" },
      }),
    );
  });
});

describe.each([false, true])("leaving the page (StrictMode: %s)", (isStrictMode) => {
  test("keep preserves an unsubmitted draft", async () => {
    const view = renderNoteForm({ isStrictMode });
    await fillNote("Draft", "travel");

    await view.hide();
    await view.show();

    expect(fieldValues()).toEqual({ title: "Draft", category: "travel" });
  });

  test("keep preserves the result and its fields", async () => {
    const view = renderNoteForm({ isStrictMode });
    await submitTakenNote();

    await view.hide();
    await view.show();

    expect(screen.getByRole("alert").textContent).toBe("That title is taken");
    expect(fieldValues()).toEqual({ title: "Taken", category: "home" });
  });

  test("clearResult drops the result and keeps the typed values", async () => {
    const view = renderNoteForm({ onLeave: "clearResult", isStrictMode });
    await submitTakenNote();

    await view.hide();
    await view.show();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(fieldValues()).toEqual({ title: "Taken", category: "home" });
  });

  test("reset drops the result and blanks the fields", async () => {
    const view = renderNoteForm({ onLeave: "reset", isStrictMode });
    await submitTakenNote();

    await view.hide();
    await view.show();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(fieldValues()).toEqual({ title: "", category: "work" });
  });

  test("reset blanks an unsubmitted draft", async () => {
    const view = renderNoteForm({ onLeave: "reset", isStrictMode });
    await fillNote("Draft", "travel");

    await view.hide();
    await view.show();

    expect(fieldValues()).toEqual({ title: "", category: "work" });
  });
});

describe.each([false, true])("leaving mid-submit (StrictMode: %s)", (isStrictMode) => {
  async function leaveAndSettle(view: ReturnType<typeof renderNoteForm>, title: string) {
    await submitNote(title, "home");
    await view.hide();
    await act(async () => view.releaseSubmission());
    await waitForSubmissionToSettle();
    await view.show();
  }

  test("keep shows a result that arrived while hidden", async () => {
    const view = renderNoteForm({ isHeldUntilReleased: true, isStrictMode });

    await leaveAndSettle(view, "Taken");

    expect(screen.getByRole("alert").textContent).toBe("That title is taken");
    expect(fieldValues()).toEqual({ title: "Taken", category: "home" });
  });

  test("clearResult drops an error that arrived while hidden, keeps the fields, and fires onError once", async () => {
    const onError = vi.fn();
    const view = renderNoteForm({
      onError,
      onLeave: "clearResult",
      isHeldUntilReleased: true,
      isStrictMode,
    });

    await leaveAndSettle(view, "Taken");

    expect(onError).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fieldValues()).toEqual({ title: "Taken", category: "home" });
  });

  test("clearResult drops a success that arrived while hidden, clears the fields, and fires onSuccess once", async () => {
    const onSuccess = vi.fn();
    const view = renderNoteForm({
      onSuccess,
      onLeave: "clearResult",
      isHeldUntilReleased: true,
      isStrictMode,
    });

    await leaveAndSettle(view, "Groceries");

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();
    expect(fieldValues()).toEqual({ title: "", category: "work" });
  });

  test("reset gives a blank form when an error arrived while hidden", async () => {
    const view = renderNoteForm({ onLeave: "reset", isHeldUntilReleased: true, isStrictMode });

    await leaveAndSettle(view, "Taken");

    expect(screen.queryByRole("alert")).toBeNull();
    expect(fieldValues()).toEqual({ title: "", category: "work" });
  });

  test("reset does not cancel the blank form's reset button after an error arrived while hidden", async () => {
    const view = renderNoteForm({ onLeave: "reset", isHeldUntilReleased: true, isStrictMode });
    await leaveAndSettle(view, "Taken");
    const user = await fillNote("Draft", "travel");

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(fieldValues()).toEqual({ title: "", category: "work" });
  });

  test.each(["keep", "clearResult", "reset"] as const)(
    "%s cannot show the page again until the submission settles",
    async (onLeave) => {
      const view = renderNoteForm({ onLeave, isHeldUntilReleased: true, isStrictMode });
      await submitNote("Taken", "home");
      await view.hide();

      await view.show();

      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
      await act(async () => view.releaseSubmission());
      await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeNull());
    },
  );
});
