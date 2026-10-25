# formActionPipe — form actions

`formActionPipe` builds server actions designed for `<form action={...}>` + React's `useActionState`. Two forms:

- `formActionPipe(schema, options?)` — the `FormData` entries are validated against a zod schema before anything else runs, and the submitted strings are echoed back on error results (see [How input echoing works](#how-input-echoing-works) for the `echo` and `omit` options).
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

export const login = formActionPipe(loginSchema, { omit: ["password"] }).handle(async ({ input }) => {
  const user = db.verifyCredentials(input.username, input.password);
  if (!user) return error("credentials", "Wrong username or password");
  await setSession(user.username);
  redirect("/notes");
});
```

Validation failures surface under the `"schema"` key; business failures use whatever keys the handler returns (`"credentials"` here). Both live in one typed union.

## The client side

[`useFormAction`](client.md#useformaction) from `@flefebvre/next-pipe/client` is `useActionState` made for these actions:

```tsx
"use client";

import { getActionError, useFormAction } from "@flefebvre/next-pipe/client";
import { login } from "../actions";

export function LoginForm() {
  const { formKey, formProps, input, error, isPending, result } = useFormAction(login);

  const fieldErrors = getActionError(result, "schema"); // zod's flattened errors

  return (
    <form key={formKey} {...formProps}>
      <input name="username" defaultValue={input?.username} />
      {fieldErrors?.fieldErrors.username && <span>{fieldErrors.fieldErrors.username}</span>}

      <input name="password" type="password" />
      {fieldErrors?.fieldErrors.password && <span>{fieldErrors.fieldErrors.password}</span>}

      <button disabled={isPending}>{isPending ? "Signing in…" : "Sign in"}</button>
      {error?.type === "credentials" && <p>{error.data}</p>}
    </form>
  );
}
```

The pieces working together:

- `formProps` (`{ action, onReset }`) goes on the `<form>`, and `formKey` as its `key` (React refuses a spread `key`).
- After an error, every field keeps what the user typed: `onReset` cancels React's automatic form reset (React ≥ 19.3), `<select>` included. A success resets the form.
- `input` is the echo of an error result (see below), for `defaultValue`: it refills the form when it remounts, and on a submit without JavaScript, where the server renders the page again.
- `error` is the error branch, narrowed by `error.type`: `error.data` is `string` once `error?.type === "credentials"`. [`getActionError(result, key)`](client.md#getactionerror) reads one key the same way.

`useFormAction(action, { onSuccess, onError, onLeave })` also takes callbacks that run once per result, and a [leave behaviour](#leaving-the-page). With a plain `useActionState`, read the echo with [`getActionInput(result)`](client.md#getactioninput): only error results carry it.

## How input echoing works

The echo is the submitted strings for the schema's keys, exactly as the user entered them and never parsed. A user who typed `ada.lovelace@exmaple` gets `ada.lovelace@exmaple` back, so the field that failed validation refills too. `File` entries, missing keys and keys outside the schema are left out. The type follows: `{ [K in keyof schema]?: string }`, so a `z.coerce.number()` field echoes as `string`.

By default it is attached as `input` to **error results only**: the validation interrupt, and the business `error`s the handler returns. Two options change that:

```ts
formActionPipe(signUpSchema, { echo: "always", omit: ["password", "passwordConfirmation"] });
```

- `echo: "onError"` (the default) or `"always"`, which echoes successes too. Leave it on `"onError"`: a form that feeds `defaultValue` from the echo refills itself after a success with no redirect, because React moves each field's `defaultValue` to the submitted value in the same commit as its automatic form reset.
- `omit`: schema keys never echoed back, typed against the schema. The echo ends up in `defaultValue`, and so in server-rendered HTML after a submit without JavaScript; leave passwords and tokens out.

The two `input`s differ on purpose. The handler's `input` is the parsed, schema-typed value (`seats: number`), which is the one to run logic on. The result's `input` is the raw echo (`seats?: string`), and it exists to feed `defaultValue`. Don't branch on it.

Echoing is the middleware's feature: results produced *upstream* of it — an interrupt from a middleware placed before validation, or any result of a schemaless `formActionPipe()` — carry no `input` field.

Form fields arrive as strings (`Object.fromEntries(formData)`), so use `z.coerce.*` in the schema for numbers, dates, or checkboxes.

## Middlewares on form actions

`formActionPipe` composes like any other pipe. With a schema, validation is the first middleware and everything else slots in behind it:

```ts
export const createNote = formActionPipe(createNoteSchema)
  .use(AuthMiddleware) // redirects to /login if there's no session
  .handle(async ({ input, user }) => {
    db.createNote(input.content, user.username);
    redirect("/notes"); // happy path: leave the form
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

Either way the handler's `input` is the parsed, schema-typed value — `FormValidationMiddleware`'s output overrides the raw entries. One consequence of placing middlewares *before* validation: their interrupts never reach the middleware, so those result branches carry no echoed `input`. `useFormAction`'s `input` and [`getActionInput`](client.md#getactioninput) both return `null` on branches that carry none.

On the happy path a form action often ends in `redirect(...)` and returns nothing; only failures flow back into `useActionState`. The form still comes back blank: Next's `RedirectBoundary` catches the redirect, navigates, and remounts the segment's subtree, form included. No result arrives, so `onSuccess` does not run for a redirect.

## Leaving the page

With Cache Components, Next keeps a page alive in a hidden `<Activity>` when the user leaves it, so a form can come back with its draft, its error messages or its "Saved" note. The page's [visit policy](activity.md) decides first: on a `fresh` page (the default) the whole page, form included, comes back as on a first visit. On a `restore` or `keep` page, give the form a leave behaviour:

```tsx
const { formKey, formProps } = useFormAction(updateProfile, {
  onSuccess: () => toast("Profile saved"),
  onLeave: "clearResult",
});
```

| `onLeave`          | When the page is hidden                         |
| ------------------ | ----------------------------------------------- |
| `"keep"` (default) | nothing: the page's policy decides               |
| `"clearResult"`    | drops the result (messages, errors), keeps what was typed |
| `"reset"`          | drops the result and blanks every field          |

A result that arrives while the page is hidden is dropped under `"clearResult"` and `"reset"`; its `onSuccess` or `onError` still runs. Run side effects (a toast, an analytics event, a `router.push`) from those callbacks, never from an effect on the result: an effect runs again every time the page is shown.

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
