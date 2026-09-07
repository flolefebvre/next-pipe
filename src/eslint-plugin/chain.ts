/**
 * Where a handler's pipe chain is rooted.
 *
 * A governed export must read `<pipe>.use(…)*.handle(…)`, where `<pipe>` is the
 * binding imported from the governing `pipe.ts`. Deciding that means walking
 * back through the chain to whatever it started from — through same-file
 * intermediates (`const p = pagePipe.use(X)`), through imported bindings and
 * through re-exports (`export { GET } from "./handlers"`), which are followed
 * into their target module rather than skipped.
 *
 * The walk is purely syntactic and stops at the first thing it cannot explain,
 * reporting an `unknown` root — which the rule reads as "not built from the
 * governing pipe".
 */

import { basename } from "node:path";
import ts from "typescript";
import { PIPE_FILE, PIPES_ENTRYPOINT } from "./kinds.js";
import { moduleExports } from "./module-exports.js";
import { normalizePath, resolveImport, sourceOf, type Analyzer } from "./ts-project.js";

export type ChainRoot =
  /** A constructor imported from `@flefebvre/next-pipe/pipes`. */
  | { kind: "library"; name: string }
  /** A binding imported from some project `pipe.ts`. */
  | { kind: "pipe"; file: string; name: string }
  /** A bare function, a call to something unrecognized, an unresolved import. */
  | { kind: "unknown" };

export type Chain = {
  root: ChainRoot;
  /** Whether the root itself was invoked, as in `pagePipe()`. */
  rootCalled: boolean;
  /** The methods applied to the root, innermost first: `["use", "handle"]`. */
  methods: readonly string[];
};

const UNKNOWN: Chain = { root: { kind: "unknown" }, rootCalled: false, methods: [] };

/** The chain behind `exportName` of `file`, following re-exports across files. */
export function analyzeExport(analyzer: Analyzer, file: string, exportName: string): Chain {
  return exportChain(analyzer, normalizePath(file), exportName, new Set());
}

/** Keyed by `file::name` so a cycle of re-exports terminates. */
type Visited = Set<string>;

function exportChain(
  analyzer: Analyzer,
  file: string,
  exportName: string,
  visited: Visited,
): Chain {
  const key = `${file}::${exportName}`;
  if (visited.has(key)) return UNKNOWN;
  visited.add(key);

  const sourceFile = sourceOf(analyzer, file);
  if (!sourceFile) return UNKNOWN;

  const binding = moduleExports(sourceFile).get(exportName);
  if (!binding || binding.kind === "opaque") return UNKNOWN;
  if (binding.kind === "expression") {
    return expressionChain(analyzer, binding.expression, sourceFile, visited);
  }
  return binding.from === undefined
    ? identifierChain(analyzer, binding.local, sourceFile, visited)
    : importedChain(analyzer, binding.from, binding.local, sourceFile, visited);
}

function importedChain(
  analyzer: Analyzer,
  specifier: string,
  imported: string,
  sourceFile: ts.SourceFile,
  visited: Visited,
): Chain {
  if (specifier === PIPES_ENTRYPOINT) {
    return { root: { kind: "library", name: imported }, rootCalled: false, methods: [] };
  }

  const resolved = resolveImport(specifier, sourceFile.fileName);
  if (!resolved) return UNKNOWN;
  if (basename(resolved) === PIPE_FILE) {
    return {
      root: { kind: "pipe", file: resolved, name: imported },
      rootCalled: false,
      methods: [],
    };
  }
  return exportChain(analyzer, resolved, imported, visited);
}

/** Resolves a top-level name to its import or its initializer, in this file. */
function identifierChain(
  analyzer: Analyzer,
  name: string,
  sourceFile: ts.SourceFile,
  visited: Visited,
): Chain {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const imported = importedNameOf(statement, name);
      if (imported === undefined) continue;
      // A namespace import (`import * as p`) binds a module, not a pipe.
      if (imported === null) return UNKNOWN;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) return UNKNOWN;
      return importedChain(analyzer, statement.moduleSpecifier.text, imported, sourceFile, visited);
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
        return declaration.initializer
          ? expressionChain(analyzer, declaration.initializer, sourceFile, visited)
          : UNKNOWN;
      }
    }
  }
  return UNKNOWN;
}

/**
 * The name `local` is imported under: `undefined` when this declaration does
 * not bind it, `null` when it binds it as a namespace.
 */
function importedNameOf(statement: ts.ImportDeclaration, local: string): string | null | undefined {
  const clause = statement.importClause;
  if (!clause) return undefined;
  if (clause.name?.text === local) return "default";

  const bindings = clause.namedBindings;
  if (!bindings) return undefined;
  if (ts.isNamespaceImport(bindings)) return bindings.name.text === local ? null : undefined;
  for (const element of bindings.elements) {
    if (element.name.text === local) return (element.propertyName ?? element.name).text;
  }
  return undefined;
}

function expressionChain(
  analyzer: Analyzer,
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  visited: Visited,
): Chain {
  const node = unwrap(expression);

  if (ts.isIdentifier(node)) return identifierChain(analyzer, node.text, sourceFile, visited);

  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    if (ts.isPropertyAccessExpression(callee)) {
      const inner = expressionChain(analyzer, callee.expression, sourceFile, visited);
      if (inner.root.kind === "unknown") return UNKNOWN;
      return { ...inner, methods: [...inner.methods, callee.name.text] };
    }
    // A call on the root itself: `pagePipe()`. Anything further out of shape —
    // `wrap(pipe)(…)`, `pipe.use(X)()` — is not a chain we can vouch for.
    const inner = expressionChain(analyzer, callee, sourceFile, visited);
    if (inner.root.kind === "unknown" || inner.rootCalled || inner.methods.length > 0) {
      return UNKNOWN;
    }
    return { ...inner, rootCalled: true };
  }

  return UNKNOWN;
}

/** Strips the wrappers that never change what a chain is rooted in. */
function unwrap(expression: ts.Expression): ts.Expression {
  let node = expression;
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAwaitExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}
