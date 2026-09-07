/**
 * Structural stand-ins for the ESLint types this plugin touches.
 *
 * Nothing here imports from `eslint`, on purpose. `eslint` is an *optional*
 * peer dependency — a consumer of `@flefebvre/next-pipe` who never lints has no
 * reason to install it — and consumers typecheck the shipped declarations with
 * `skipLibCheck: false` (see `tests/dist-consumer`), where a dangling
 * `import … from "eslint"` in a `.d.ts` is a hard error rather than an `any`.
 *
 * These describe only the members the rule actually reads, so they stay small;
 * at runtime ESLint passes its own objects, which satisfy them structurally.
 */

export interface EstreeNode {
  type: string;
}

/** `export { a as b }` / `export { a as "b" }`. */
export interface ExportedName {
  type: string;
  name?: string;
  value?: string;
}

export interface ExportSpecifierNode {
  exportKind?: string;
  exported: ExportedName;
}

export interface DeclarationNode {
  type: string;
  id?: { name?: string } | null;
  declarations?: { id: { type: string; name?: string } }[];
}

export interface ExportNode extends EstreeNode {
  exportKind?: string;
  declaration?: DeclarationNode | null;
  specifiers?: ExportSpecifierNode[];
}

export interface ProgramNode extends EstreeNode {
  body: ExportNode[];
}

export interface ReportDescriptor {
  node: EstreeNode;
  messageId: string;
  data?: Record<string, string>;
}

export interface RuleContext {
  filename: string;
  cwd: string;
  report(descriptor: ReportDescriptor): void;
}

/**
 * The linted file's text, reached from the context by a cast.
 *
 * It is not a member of `RuleContext` above on purpose: ESLint's own
 * `RuleContext` is generic over its language, and the `SourceCode` it carries
 * covers binary languages too, so it declares neither `text` nor `getText()`.
 * Requiring either would make this rule structurally incompatible with
 * `ESLint.Plugin`, and `eslint.config.mjs` files are routinely `// @ts-check`ed.
 * At runtime the JavaScript `SourceCode` always has `text`.
 */
export type SourceCodeHolder = { sourceCode: { text: string } };

export interface RuleModule {
  meta: {
    type: "problem";
    docs: { description: string; url: string };
    schema: never[];
    messages: Record<string, string>;
  };
  create(context: RuleContext): { "Program:exit"(node: ProgramNode): void };
}

/**
 * What a flat config item may hold under `plugins`. Deliberately narrower than
 * `Plugin`: a config item that referenced the full plugin would make the two
 * types mutually recursive, and nothing structurally assignable to ESLint's own
 * `Plugin` / `Config` pair could come out of it.
 */
export interface RulesPlugin {
  rules: { "use-pipe-file": RuleModule };
}

/** One item of a flat config array. */
export interface FlatConfigItem {
  name?: string;
  files?: string[];
  plugins?: Record<string, RulesPlugin>;
  rules?: Record<string, "error" | "warn" | "off">;
}

export interface Plugin extends RulesPlugin {
  meta: { name: string; version: string };
  configs: { recommended: FlatConfigItem[] };
}
