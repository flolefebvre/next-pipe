# Migrating

Version-to-version upgrade notes. Only read the section for the jump you are making.

## 1.0.0 → 2.0.0

### Form results echo the raw submitted strings

The `input` that [`FormValidationMiddleware`](form-action-pipe.md#how-input-echoing-works) echoes onto form-action results (and that `getActionInput` reads) is now the submitted strings for the schema's keys, unparsed. In 1.0 it was re-parsed field by field, and any field that failed came back `undefined`, so the form wiped exactly the field the user had to fix. Now every submitted field comes back, failed ones included.

The result-side type changes for fields whose parsed type is not `string`:

```ts
const schema = z.object({ seats: z.coerce.number() });
result.input; // 1.0 → { seats?: number }
//               2.0 → { seats?: string }
```

Schemas whose fields are all strings see no type change. The handler's `input` is unchanged: still the parsed, schema-typed value.

To migrate: let `tsc` flag the call sites. Code that only passes the echo to `defaultValue` keeps working. Code that ran logic on a parsed echoed value should read it from the handler's `input` instead, or parse the string itself. `File` entries were never usable as `defaultValue` and are no longer echoed.

## 0.x → 1.0.0

### Generated builders are the uppercase verb

Generated builders and barrel members are named after the verb **verbatim** (uppercase) instead of lowercased, and `definition.method` is the uppercase verb:

```ts
routes.api.notes(id).like.post(); // 0.x → { …, method: "post" }
routes.api.notes(id).like.POST(); // 1.0 → { …, method: "POST" }
```

This fixes two defects that lowercasing caused:

- **`DELETE`** — `delete` is a reserved word, so `export const delete = …` was a syntax error: any app with a `DELETE` route generated a file that did not compile.
- **`PATCH`** — `fetch` normalizes `get`/`post`/`put`/`delete`/`head`/`options` to uppercase but **not** `patch`, so a generated PATCH builder sent `patch` and Next answered `405 Method Not Allowed`.

To migrate: re-run `next-pipe gen` and let `tsc` flag the call sites — every renamed builder is a compile error, none is a silent behavior change. If you compare `definition.method` anywhere, compare against the uppercase verb.
