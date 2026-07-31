# formActionPipe — form actions

`formActionPipe` builds server actions designed for `<form action={...}>` + React's `useActionState`. Two forms:

- `formActionPipe(schema)` — the `FormData` entries are validated against a zod schema before anything else runs, and submitted values are echoed back on every result.
- `formActionPipe()` — no validation wired in: the handler receives the raw entries. Chain [`FormValidationMiddleware`](built-in-middlewares.md#formvalidationmiddleware) yourself if you want validation elsewhere in the chain (see [Middlewares on form actions](#middlewares-on-form-actions)).

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

Echoing is the middleware's feature: results produced *upstream* of it — an interrupt from a middleware placed before validation, or any result of a schemaless `formActionPipe()` — carry no `input` field.

Form fields arrive as strings (`Object.fromEntries(formData)`), so use `z.coerce.*` in the schema for numbers, dates, or checkboxes.

## Middlewares on form actions

`formActionPipe` composes like any other pipe. With a schema, validation is the first middleware and everything else slots in behind it:

```ts
export const createNote = formActionPipe(createNoteSchema)
  .use(AuthMiddleware) // redirects to /login if there's no session
  .handle(async ({ input, user }) => {
    db.createNote(input.content, user.username);
    redirect("/notes"); // happy path: re-render the page, reset the form
  });
```

Starting from `formActionPipe()` instead, nothing is wired in — chain `FormValidationMiddleware` yourself to choose where validation sits in the chain:

```ts
import { FormValidationMiddleware } from "@flefebvre/next-pipe/middlewares/form-actions";

export const createNote = formActionPipe()
  .use(AuthMiddleware) // runs before the schema
  .use(FormValidationMiddleware, createNoteSchema)
  .handle(async ({ input, user }) => {
    // input: parsed and typed by the schema, exactly as with formActionPipe(schema)
    db.createNote(input.content, user.username);
    redirect("/notes");
  });
```

Either way the handler's `input` is the parsed, schema-typed value — `FormValidationMiddleware`'s output overrides the raw entries. One consequence of placing middlewares *before* validation: their interrupts never reach the middleware, so those result branches carry no echoed `input`. On the client, `result?.input` alone then no longer typechecks — narrow the branches that lack it away first: `const input = result && "input" in result ? result.input : undefined`.

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
