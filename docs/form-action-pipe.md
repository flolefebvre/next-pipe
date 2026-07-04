# formActionPipe — form actions

`formActionPipe(schema)` builds server actions designed for `<form action={...}>` + React's `useActionState`. It differs from [`actionPipe`](action-pipe.md) in three ways:

1. **Signature** — the produced action is `(prevState, formData: FormData) => ...`, exactly what `useActionState` expects.
2. **Parsing** — the `FormData` entries are collected into an object and validated against the zod schema by [`FormValidationMiddleware`](built-in-middlewares.md#formvalidationmiddleware).
3. **Echoing input back** — every result (validation failure *or* handler return) carries an `input` field with the values the user typed, so the form can repopulate after a failed submit.

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

On a validation failure, the middleware can't hand you `z.infer<typeof schema>` — the input didn't parse. Instead it re-parses each field *individually*, best-effort: valid fields keep their parsed values, invalid or missing ones become `undefined`. The result is attached as `input` on the interrupt, and the middleware's `after` merges the same `input` into handler-returned results too. That's why `result?.input.username` is available on **every** non-null state, whichever key failed.

Form fields arrive as strings (`Object.fromEntries(formData)`), so use `z.coerce.*` in the schema for numbers, dates, or checkboxes.

## Middlewares on form actions

`formActionPipe` composes like any other pipe — auth gates, entity loaders, and other action-flavored middlewares slot in after the schema validation:

```ts
export const createNote = formActionPipe(createNoteSchema)
  .use(AuthMiddleware) // redirects to /login if there's no session
  .handle(async ({ input, user }) => {
    db.createNote(input.content, user.username);
    redirect("/notes"); // happy path: re-render the page, reset the form
  });
```

On the happy path a form action often ends in `redirect(...)` and returns nothing; only failures flow back into `useActionState`.

## See also

- [actionPipe](action-pipe.md) — for actions called from code rather than forms
- [Built-in middlewares](built-in-middlewares.md#formvalidationmiddleware)
- [Client & hooks](client.md#getactionerror)
