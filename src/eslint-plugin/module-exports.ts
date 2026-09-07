/**
 * A module's value exports, read syntactically off the TypeScript AST.
 *
 * Type-only exports are dropped: the convention is about the *values* a file
 * ships. `export * from "…"` is deliberately not enumerated — the names it
 * contributes cannot be known without resolving and reading the target, and the
 * rule treats that as unanalyzable rather than guessing (see docs).
 */

import ts from "typescript";

export type ExportBinding =
  /** `export const x = <expr>` / `export default <expr>` — analyzable. */
  | { kind: "expression"; expression: ts.Expression }
  /** A binding whose value is a declaration (function, class, enum, …). */
  | { kind: "opaque" }
  /** `export { a as b }`, with `from` set when it is a re-export. */
  | { kind: "reference"; local: string; from: string | undefined };

export type ModuleExports = Map<string, ExportBinding>;

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

function moduleSpecifierOf(node: ts.ExportDeclaration): string | undefined {
  const { moduleSpecifier } = node;
  return moduleSpecifier && ts.isStringLiteral(moduleSpecifier) ? moduleSpecifier.text : undefined;
}

/** Every value export of `sourceFile`, keyed by its exported name. */
export function moduleExports(sourceFile: ts.SourceFile): ModuleExports {
  const exports: ModuleExports = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      // `export * from "…"`: unanalyzable, skipped silently.
      if (!clause) continue;
      if (ts.isNamespaceExport(clause)) {
        exports.set(clause.name.text, { kind: "opaque" });
        continue;
      }
      const from = moduleSpecifierOf(statement);
      for (const specifier of clause.elements) {
        if (specifier.isTypeOnly) continue;
        exports.set(specifier.name.text, {
          kind: "reference",
          local: (specifier.propertyName ?? specifier.name).text,
          from,
        });
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      // `export = x` is CommonJS and cannot appear in an app-router module.
      if (statement.isExportEquals) continue;
      exports.set("default", { kind: "expression", expression: statement.expression });
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        // Destructuring patterns bind no single analyzable name.
        if (!ts.isIdentifier(declaration.name)) continue;
        exports.set(
          declaration.name.text,
          declaration.initializer
            ? { kind: "expression", expression: declaration.initializer }
            : { kind: "opaque" },
        );
      }
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      const name = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
        ? "default"
        : statement.name?.text;
      if (name) exports.set(name, { kind: "opaque" });
    }
  }

  return exports;
}
