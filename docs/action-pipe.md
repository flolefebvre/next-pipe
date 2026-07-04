# actionPipe — server actions

`actionPipe` builds typed server actions. Two forms:

- `actionPipe()` — an action with no input (e.g. `logout`).
- `actionPipe(schema)` — an action whose single argument is validated against a zod schema before the handler runs.

Both pin the action's output to the [success/error protocol](core-concepts.md#the-successerror-protocol-actions): handlers must return `success(...)` or `error(...)`.

```ts
"use server";

import z from "zod";
import { actionPipe } from "@flefebvre/next-pipe/pipes";
import { success, error } from "@flefebvre/next-pipe/server";
import { AuthMiddleware } from "@/lib/middlewares/auth-middleware";
import { EntityLoaderMiddleware } from "@/lib/middlewares/entity-loader-middleware";

const deleteNoteSchema = z.object({ id: z.string() });

export const deleteNote = actionPipe(deleteNoteSchema)
  .use(AuthMiddleware)
  .use(EntityLoaderMiddleware, "note", ({ input }: { input: { id: string } }) => db.findNote(input.id))
  .handle(async ({ input, user, note }) => {
    const canDelete = note.author === user.username || user.role === "admin";
    if (!canDelete) return error("forbidden", "Only the author or an admin can delete this note");

    db.deleteNote(input.id);
    revalidatePath("/notes");
    return success();
  });
```

The produced function is a normal server action: `await deleteNote({ id })`.

## Input validation

`actionPipe(schema)` composes [`InputValidationMiddleware`](built-in-middlewares.md#inputvalidationmiddleware) for you. The handler receives the **parsed** value as `input` (so zod transforms and coercions apply), and an invalid argument short-circuits with:

```ts
error("schema", flattenedZodError)
// { status: "error", error: { type: "schema", data: { formErrors, fieldErrors } } }
```

The `"schema"` key sits in the same typed union as your own `error(...)` returns — callers can't tell (and don't care) whether an error came from a middleware or the handler.

## Returning results

```ts
import { success, error } from "@flefebvre/next-pipe/server";

return success();              // { status: "success", data: undefined }
return success({ id });        // { status: "success", data: { id } }
return error("forbidden", "Only the author can delete this");
// { status: "error", error: { type: "forbidden", data: "Only the author..." } }
```

Every `error(key, data)` — from the handler *or* an interrupting middleware — contributes a typed member to the action's result union. `redirect(...)` and `notFound()` from `next/navigation` work normally inside handlers and middlewares (they throw, so they bypass the result protocol entirely).

## Reading results on the client

Narrow on `status`, or pull a specific error key with [`getActionError`](client.md#getactionerror):

```ts
"use client";
import { getActionError } from "@flefebvre/next-pipe/client";

const res = await deleteNote({ id });
if (res.status === "error") {
  setError(getActionError(res, "forbidden") ?? getActionError(res, "notFound") ?? "Error");
  return;
}
router.refresh();
```

`getActionError(res, key)` returns the error's `data` — typed for that specific key — or `null`, so unrelated keys and successes fall through cleanly.

## Actions without input

```ts
export const logout = actionPipe().handle(async () => {
  await clearSession();
  redirect("/login");
  return success();
});
```

No schema, no argument: `await logout()`.

> Submitting from a `<form action={...}>` with `useActionState`? Use [`formActionPipe`](form-action-pipe.md) instead — it parses `FormData`, matches the `useActionState` signature, and echoes entered values back on validation failure.

## See also

- [Core concepts](core-concepts.md) — how middlewares merge context and interrupt
- [Built-in middlewares](built-in-middlewares.md#inputvalidationmiddleware)
- [Client & hooks](client.md#getactionerror)
