# Migrating

Version-to-version upgrade notes. Only read the section for the jump you are making.

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
