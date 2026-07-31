# formActionPipe — form actions

`formActionPipe` builds server actions designed for `<form action={...}>` + React's `useActionState`. Two forms:

- `formActionPipe(schema)` — the `FormData` entries are validated against a zod schema before anything else runs, and submitted values are echoed back on every result. The shorthand for forms where validation *should* come first.
- `formActionPipe()` — no validation wired in: the handler receives the raw entries, and you chain [`FormValidationMiddleware`](built-in-middlewares.md#formvalidationmiddleware) yourself wherever it belongs — typically *after* an auth gate (see [Auth before validation](#auth-before-validation)).

Both differ from [`actionPipe`](action-pipe.md) in the same way: the produced action is `(prevState, formData: FormData) => ...`, exactly what `useActionState` expects, and the `FormData` entries are collected into an object with `Object.fromEntries`.

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
  redirect("/notes");
});
```

Validation failures surface under the `"schema"` key; business failures use whatever keys the handler returns (`"credentials"` here). Both live in one typed union.

## The client side

```tsx
"use client";

import { useActionState } from "react";
import { getActionError } from "@flefebvre/next-pipe/client";
import { login } from "../actions";

export function LoginForm() {
  const [result, dispatch, isPending] = useActionState(login, null);

  const fieldErrors = getActionError(result, "schema");         // zod's flattened errors
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

Note the three pieces working together:

- `result?.input.username` — the echoed-back input (see below), used as `defaultValue` so a failed submit doesn't wipe the form.
- `getActionError(result, "schema")` — zod's `{ formErrors, fieldErrors }`, typed to the schema's keys.
- `getActionError(result, "credentials")` — the handler's own error, typed as `string`.

## How input echoing works

On a validation failure, the middleware can't hand you `z.infer<typeof schema>` — the input didn't parse. Instead it re-parses each field *individually*, best-effort: valid fields keep their parsed values, invalid or missing ones become `undefined`. The result is attached as `input` on the interrupt, and the middleware's `after` merges the same `input` into handler-returned results too. That's why `result?.input.username` is available on every result that passes through `FormValidationMiddleware`, whichever key failed.

Echoing is the middleware's feature: results produced *upstream* of it — an interrupt from an auth middleware placed before validation, or any result of a schemaless `formActionPipe()` — carry no `input` field.

Form fields arrive as strings (`Object.fromEntries(formData)`), so use `z.coerce.*` in the schema for numbers, dates, or checkboxes.

## Auth before validation

`formActionPipe(schema)` wires validation as the *first* middleware — anything you `.use(...)` afterwards runs behind it. For an auth-gated form that ordering is backwards: an unauthenticated submitter gets your schema's field errors before ever being turned away, leaking the form's validation rules. Gate first, validate second, by starting from the schemaless pipe and chaining `FormValidationMiddleware` explicitly:

```ts
import { formActionPipe } from "@flefebvre/next-pipe/pipes";
import { FormValidationMiddleware } from "@flefebvre/next-pipe/middlewares/form-actions";

export const createNote = formActionPipe()
  .use(AuthMiddleware) // interrupts (or redirects to /login) before the schema ever runs
  .use(FormValidationMiddleware, createNoteSchema)
  .handle(async ({ input, user }) => {
    // input: parsed and typed by the schema, exactly as with formActionPipe(schema)
    db.createNote(input.content, user.username);
    redirect("/notes"); // happy path: re-render the page, reset the form
  });
```

The handler's `input` is the parsed, schema-typed value — `FormValidationMiddleware`'s output overrides the raw entries — plus whatever earlier middlewares merged (`user` here). One consequence of the ordering: an auth interrupt never reaches the validation middleware, so that result branch carries no echoed `input` — in the action's result union, `input` exists only on the branches that pass through validation. That's the point: an unauthorized submitter gets nothing back, not even their own input replayed.

On the client, that union means `result?.input` alone no longer typechecks — the unauthorized branch has no `input` property. Narrow it away first:

```tsx
const [result, dispatch, isPending] = useActionState(createNote, null);
const input = result && "input" in result ? result.input : undefined;

<input name="content" defaultValue={input?.content} />;
```

On the happy path a form action often ends in `redirect(...)` and returns nothing; only failures flow back into `useActionState`.

## Without a schema

`formActionPipe()` on its own suits form-shaped buttons and hand-rolled parsing: the handler receives the collected entries as `input` (a `Record<string, FormDataEntryValue>` — values are `string | File`), nothing is validated, and no `input` is echoed back. The output is still pinned to the `success`/`error` protocol, and zod is not required at all — same as `actionPipe()`.

```ts
export const logout = formActionPipe().handle(async () => {
  await clearSession();
  redirect("/login");
  return success();
});
```

## See also

- [actionPipe](action-pipe.md) — for actions called from code rather than forms
- [Built-in middlewares](built-in-middlewares.md#formvalidationmiddleware)
- [Client & hooks](client.md#getactionerror)
