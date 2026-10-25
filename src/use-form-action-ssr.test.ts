import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { useFormAction } from "./use-form-action.js";

// A server action reaches the client as a server reference: React's server
// renderer reads its `$$FORM_ACTION` (kept by its own `bind`) to render a
// form that submits without JavaScript. This stand-in has the same shape.
function serverReference<T extends (...args: never[]) => unknown>(fn: T, id: string): T {
  return Object.assign(fn, {
    $$FORM_ACTION: (identifierPrefix: string) => ({
      name: `$ACTION_ID_${identifierPrefix}${id}`,
      method: "POST",
      encType: "multipart/form-data",
      data: null,
    }),
    bind: (thisArg: unknown, ...args: unknown[]) =>
      serverReference(Function.prototype.bind.call(fn, thisArg, ...args) as T, id),
  });
}

const createNote = serverReference(
  async () => ({
    status: "success" as const,
    data: undefined,
  }),
  "createNote",
);

function NoteForm() {
  const { formKey, formProps } = useFormAction(createNote);
  return createElement(
    "form",
    { key: formKey, ...formProps },
    createElement("button", null, "Save"),
  );
}

test("the server render keeps the form submittable without JavaScript", () => {
  const html = renderToString(createElement(NoteForm));

  expect(html).toContain('method="POST"');
  expect(html).toContain("createNote");
});
