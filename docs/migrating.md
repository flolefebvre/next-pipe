# Migrating

Version-to-version upgrade notes. Only read the section for the jump you are making.

## 2.0.0 → 3.0.0

3.0 makes pages, layouts and forms behave under Cache Components, where Next hides a route in `<Activity>` instead of unmounting it. See [Activity](activity.md).

### Peer dependencies: React ≥ 19.3, Next.js ≥ 16.3

The visit boundary keys on `useRouter().bfcacheId` (Next 16.3) and uses a Fragment ref (React 19.3); `useFormAction` cancels React's automatic form reset, which a React `onReset` handler can only do from 19.3. Upgrade `react`, `react-dom` and `next` first.

### Pages and layouts reset on every return by default

`pagePipe()` and `layoutPipe()` now wrap their output in a client boundary with `visits: "fresh"`: a page the user comes back to, by link or by Back, looks like a first visit. Without Cache Components nothing visible changes, since Next unmounts routes on navigation anyway. With it, state that 2.x let survive a round trip (drafts, open dialogs, messages) is now reset.

To migrate: decide per page. Where a return should restore state, opt in:

```ts
pagePipe<PageProps<"/notes">>({ visits: "restore" }); // restored on Back/Forward only
layoutPipe<LayoutProps<"/dashboard">>({ visits: "keep" }); // the 2.x behaviour
```

Root layouts (output `<html>`) are never wrapped. Smaller consequences:

- A page or layout handler called directly, in a test, now returns the boundary element around the tree. Pass `{ visits: "keep" }` there, or read the tree from the element's `props.children`.
- The pipe's output type is `React.ReactNode` rather than the handler's narrower return type.
- `onBlur` no longer runs when a `fresh` page is left: the focused element is blurred while React ignores the event. Autosave on leave belongs in an explicit signal, such as `useFormAction`'s `onLeave`.

### Form successes no longer echo the input

`FormValidationMiddleware` (and so `formActionPipe(schema)`) now echoes the submitted input onto **error** results only. In 2.x a success carried it too, which made a form feeding `defaultValue` from the echo refill itself after a success with no redirect, instead of clearing.

```ts
result.input; // 2.x → on every result
//               3.0 → on error results; the success branch has no `input`
```

To migrate: let `tsc` flag the call sites. `result?.input.x` on the full union no longer typechecks; read the echo with `getActionInput(result)`, or move the form to [`useFormAction`](client.md#useformaction) and its `input`. If code really needs the echo on a success, pass `formActionPipe(schema, { echo: "always" })`. While there, add `omit: ["password"]` to forms with secrets: the echo ends up in server-rendered HTML.

### New: `useFormAction`

Not breaking, but the reason for the two changes above: `useFormAction(action, { onSuccess, onError, onLeave })` in `/client` replaces `useActionState` for form actions. See [Client & hooks](client.md#useformaction).

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
