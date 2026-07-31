# Server actions & form actions

Decision rule: submitted from `<form action={...}>` with `useActionState` → `formActionPipe`. Called from code (`await doThing(arg)`) → `actionPipe`.

Both speak the result protocol instead of HTTP:

```ts
import { success, error } from "@flefebvre/next-pipe/server";

return success({ id });         // { status: "success", data: { id } }
return error("forbidden", msg); // { status: "error", error: { type: "forbidden", data: msg } }
```

Every `error(key, data)` — from handler or interrupting middleware — becomes a typed member of the result union. `redirect(...)` / `notFound()` from `next/navigation` throw, bypassing the protocol — use them freely.

## actionPipe

```ts
"use server";

import z from "zod";
import { actionPipe } from "@flefebvre/next-pipe/pipes";
import { success, error } from "@flefebvre/next-pipe/server";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";

export const deleteNote = actionPipe(z.object({ id: z.string() }))
  .use(AuthMiddleware)
  .handle(async ({ input, user }) => {
    const note = db.findNote(input.id);
    if (!note) return error("notFound", "No such note");
    if (note.author !== user.username) return error("forbidden", "Only the author can delete");
    db.deleteNote(input.id);
    revalidatePath("/notes");
    return success();
  });
// Call site: await deleteNote({ id })
```

- `actionPipe(schema)` auto-wires `InputValidationMiddleware`: the handler gets the **parsed** value as `input` (zod transforms/coercions applied); an invalid argument short-circuits with `error("schema", flattenedZodError)` — same union as your own keys.
- `actionPipe()` (no schema) = no argument: `export const logout = actionPipe().handle(async () => { await clearSession(); redirect("/login"); return success(); });`

Reading results on the client — narrow on `status` or pull one key with `getActionError` (returns that key's `data`, typed, or `null` for successes/other keys/`null` input):

```ts
import { getActionError } from "@flefebvre/next-pipe/client";

const res = await deleteNote({ id });
if (res.status === "error") {
  setError(getActionError(res, "forbidden") ?? getActionError(res, "notFound") ?? "Error");
  return;
}
```

## formActionPipe

Differences from `actionPipe`: the produced action is `(prevState, formData: FormData)` — exactly `useActionState`'s shape — and the `FormData` is collected into an object. Two forms:

- `formActionPipe(schema)` — validation runs first (`FormValidationMiddleware`, auto-wired), and every result carries an `input` field echoing what the user typed, for repopulating the form.
- `formActionPipe()` — nothing wired: the handler gets the raw entries (`input: Record<string, FormDataEntryValue>`), results carry no `input` echo, zod not required. Chain `FormValidationMiddleware` yourself to place validation elsewhere in the chain (see the rule below).

```ts
"use server";

import z from "zod";
import { redirect } from "next/navigation";
import { formActionPipe } from "@flefebvre/next-pipe/pipes";
import { error } from "@flefebvre/next-pipe/server";

const loginSchema = z.object({
  username: z.string().nonempty("Username is required"),
  password: z.string().nonempty("Password is required"),
});

export const login = formActionPipe(loginSchema).handle(async ({ input }) => {
  const user = db.verifyCredentials(input.username, input.password);
  if (!user) return error("credentials", "Wrong username or password");
  await setSession(user.username);
  redirect("/notes"); // happy path: redirect, return nothing
});
```

```tsx
"use client";

import { useActionState } from "react";
import { getActionError } from "@flefebvre/next-pipe/client";
import { login } from "../actions";

export function LoginForm() {
  const [result, dispatch, isPending] = useActionState(login, null);
  const fieldErrors = getActionError(result, "schema");           // zod { formErrors, fieldErrors }
  const credentialsError = getActionError(result, "credentials"); // string

  return (
    <form action={dispatch}>
      <input name="username" defaultValue={result?.input.username} />
      {fieldErrors?.fieldErrors.username && <span>{fieldErrors.fieldErrors.username}</span>}
      <input name="password" type="password" />
      {fieldErrors?.fieldErrors.password && <span>{fieldErrors.fieldErrors.password}</span>}
      <button disabled={isPending}>{isPending ? "Signing in…" : "Sign in"}</button>
      {credentialsError && <p>{credentialsError}</p>}
    </form>
  );
}
```

Rules:

- Form fields arrive as strings — use `z.coerce.*` for numbers, dates, checkboxes.
- Validation failures land under the `"schema"` key; handler business failures use their own keys — one typed union.
- `result?.input.<field>` exists on every non-null result that passed through `FormValidationMiddleware` — with `formActionPipe(schema)`, that's all of them (echoed best-effort: invalid fields become `undefined`) — use it as `defaultValue` so failed submits don't wipe the form.
- To place validation elsewhere in the chain, start from `formActionPipe()` and chain `FormValidationMiddleware` explicitly:

  ```ts
  import { FormValidationMiddleware } from "@flefebvre/next-pipe/middlewares/form-actions";

  export const createNote = formActionPipe()
    .use(AuthMiddleware) // runs before the schema
    .use(FormValidationMiddleware, createNoteSchema)
    .handle(async ({ input, user }) => {
      /* input: parsed, schema-typed */
    });
  ```

  Interrupts from middlewares placed before validation carry no `input` property at all — on the client, narrow before reading it: `const input = result && "input" in result ? result.input : undefined`.
- Happy path usually ends in `redirect(...)`; only failures flow back into `useActionState`.

## Done when

- The action typechecks, every error key the handler can return is handled at the call site (or deliberately funneled to a fallback), and forms repopulate via `result?.input` on failure.
