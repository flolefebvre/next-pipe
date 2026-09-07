/**
 * `next-pipe/use-pipe-file` — build handlers from the closest `pipe.ts`.
 *
 * The convention it enforces: a `pipe.ts` in any directory exports pre-composed
 * pipes named after the six kinds, and every file *at or below* that directory
 * builds its handler(s) from the matching one. Where no `pipe.ts` above a file
 * exports its kind, the file is free to do whatever it likes.
 *
 * ESLint's ESTree nodes are used only to place the reports; every question
 * about what a file exports and where its chain is rooted is answered on the
 * TypeScript AST (see `ts-project.ts`), including for the linted file itself,
 * so there is a single analysis code path.
 */

import { basename, dirname, relative, sep } from "node:path";
import ts from "typescript";
import { VERBS } from "../codegen/analyze-routes.js";
import { analyzeExport, type Chain } from "./chain.js";
import type {
  DeclarationNode,
  ExportNode,
  ProgramNode,
  RuleContext,
  RuleModule,
  SourceCodeHolder,
} from "./eslint-types.js";
import { findGoverningPipe } from "./governing.js";
import {
  ACTION_PIPE_NAMES,
  DEFAULT_EXPORT_STEMS,
  isActionPipeName,
  isPipeName,
  PIPE_FILE,
  PIPE_NAMES,
  ROUTE_STEM,
  stemOf,
  type PipeName,
} from "./kinds.js";
import { moduleExports } from "./module-exports.js";
import { normalizePath, sourceOf, type Analyzer } from "./ts-project.js";

const ALLOWED = `${PIPE_NAMES.slice(0, -1).join(", ")} or ${PIPE_NAMES.at(-1)}`;

const messages = {
  mustUsePipe: "{{subject}} must be built from {{expected}}.",
  unexpectedExport: `${PIPE_FILE} may only export ${ALLOWED}; {{what}}.`,
};

/** Everything one invocation of the rule needs, gathered once. */
type Check = {
  context: RuleContext;
  analyzer: Analyzer;
  file: string;
  cwd: string;
  sourceFile: ts.SourceFile;
  nodes: Map<string, ExportNode>;
};

export const usePipeFile: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require handlers to be built from the pipe exported by the closest `pipe.ts` above them.",
      url: "https://github.com/flolefebvre/next-pipe/blob/main/docs/eslint-plugin.md",
    },
    schema: [],
    messages,
  },
  create(context) {
    return {
      "Program:exit"(program) {
        run(context, program);
      },
    };
  },
};

function run(context: RuleContext, program: ProgramNode): void {
  const file = normalizePath(context.filename);
  const name = basename(file);
  const stem = stemOf(name);
  if (stem === undefined) return;

  const kind = DEFAULT_EXPORT_STEMS.get(stem);
  const named = kind !== undefined || name === PIPE_FILE || stem === ROUTE_STEM;

  const { sourceCode } = context as unknown as SourceCodeHolder;
  // The recommended config runs on every `.ts`/`.tsx` file, and re-parsing each
  // one on the TypeScript side would double the cost of a lint run for nothing.
  // A file-level `"use server"` cannot exist without that literal in the text.
  if (!named && !sourceCode.text.includes("use server")) return;

  const analyzer: Analyzer = { liveFile: file, liveText: sourceCode.text };
  const sourceFile = sourceOf(analyzer, file);
  if (!sourceFile) return;
  if (!named && !hasUseServerDirective(sourceFile)) return;

  const check: Check = {
    context,
    analyzer,
    file,
    cwd: normalizePath(context.cwd),
    sourceFile,
    nodes: exportNodes(program),
  };

  if (name === PIPE_FILE) return checkPipeFile(check);
  if (kind) return checkDefaultExport(check, kind);
  if (stem === ROUTE_STEM) return checkRoute(check);
  return checkUseServer(check);
}

/* ── the four kinds of checked file ─────────────────────────────────────── */

function checkDefaultExport(check: Check, kind: PipeName): void {
  const governing = findGoverningPipe(check.analyzer, dirname(check.file), kind, check.cwd);
  if (!governing || !check.nodes.has("default")) return;

  const chain = analyzeExport(check.analyzer, check.file, "default");
  if (accepts(chain, governing, kind, true)) return;
  report(check, "default", basename(check.file), expectation(check, [kind], governing));
}

function checkRoute(check: Check): void {
  const governing = findGoverningPipe(check.analyzer, dirname(check.file), "routePipe", check.cwd);
  if (!governing) return;

  for (const verb of VERBS) {
    if (!check.nodes.has(verb)) continue;
    const chain = analyzeExport(check.analyzer, check.file, verb);
    if (accepts(chain, governing, "routePipe", true)) continue;
    report(check, verb, verb, expectation(check, ["routePipe"], governing));
  }
}

function checkUseServer(check: Check): void {
  const governing = new Map<PipeName, string>();
  for (const kind of ACTION_PIPE_NAMES) {
    const file = findGoverningPipe(check.analyzer, dirname(check.file), kind, check.cwd);
    if (file) governing.set(kind, file);
  }
  if (governing.size === 0) return;

  for (const exportName of moduleExports(check.sourceFile).keys()) {
    if (!check.nodes.has(exportName)) continue;

    const chain = analyzeExport(check.analyzer, check.file, exportName);
    const subject = exportName === "default" ? "the default export" : exportName;
    const root = chain.root.kind === "unknown" ? undefined : chain.root.name;

    // Rooted in a recognizable action kind: only that kind's pipe applies.
    if (root !== undefined && isActionPipeName(root)) {
      const file = governing.get(root);
      if (!file || accepts(chain, file, root, true)) continue;
      report(check, exportName, subject, expectation(check, [root], file));
      continue;
    }

    // Nothing recognizable to root it in: name every governed action kind.
    report(check, exportName, subject, anyActionExpectation(check, governing));
  }
}

function checkPipeFile(check: Check): void {
  // Strictly above: a `pipe.ts` is never governed by itself.
  const ancestors = dirname(dirname(check.file));

  for (const exportName of moduleExports(check.sourceFile).keys()) {
    const node = check.nodes.get(exportName);
    if (!node) continue;

    if (!isPipeName(exportName)) {
      const what =
        exportName === "default"
          ? "a default export is not one of them"
          : `'${exportName}' is not one of them`;
      check.context.report({ node, messageId: "unexpectedExport", data: { what } });
      continue;
    }

    const governing = findGoverningPipe(check.analyzer, ancestors, exportName, check.cwd);
    if (!governing) continue;

    const chain = analyzeExport(check.analyzer, check.file, exportName);
    if (accepts(chain, governing, exportName, false)) continue;
    report(check, exportName, exportName, expectation(check, [exportName], governing));
  }
}

/* ── accepting a chain ──────────────────────────────────────────────────── */

/**
 * The accepted shape: the governing binding itself (never invoked — a pipe
 * instance is not a constructor), then zero or more `.use(…)`, then `.handle(…)`
 * for a handler. A `pipe.ts` export stops before `.handle`: it is still a pipe.
 */
function accepts(chain: Chain, file: string, name: PipeName, handler: boolean): boolean {
  const { root } = chain;
  if (root.kind !== "pipe" || root.file !== file || root.name !== name || chain.rootCalled) {
    return false;
  }
  if (!handler) return chain.methods.every((method) => method === "use");
  return (
    chain.methods.at(-1) === "handle" &&
    chain.methods.slice(0, -1).every((method) => method === "use")
  );
}

/* ── reporting ──────────────────────────────────────────────────────────── */

function report(check: Check, exportName: string, subject: string, expected: string): void {
  const node = check.nodes.get(exportName);
  if (!node) return;
  check.context.report({ node, messageId: "mustUsePipe", data: { subject, expected } });
}

/** e.g. `pagePipe exported by src/app/admin/pipe.ts`. */
function expectation(check: Check, names: readonly PipeName[], file: string): string {
  const list =
    names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names.join("");
  return `${list} exported by ${displayPath(check, file)}`;
}

/** Every governed action kind, collapsed when they share a `pipe.ts`. */
function anyActionExpectation(check: Check, governing: Map<PipeName, string>): string {
  const kinds = ACTION_PIPE_NAMES.filter((kind) => governing.has(kind));
  const files = new Set(kinds.map((kind) => governing.get(kind)));
  const [only] = files;
  if (files.size === 1 && only) return expectation(check, kinds, only);
  return kinds.map((kind) => expectation(check, [kind], governing.get(kind)!)).join(" or ");
}

/** Relative to the linter's cwd, with forward slashes on every platform. */
function displayPath(check: Check, file: string): string {
  const path = relative(check.cwd, file);
  return path === "" ? file : path.split(sep).join("/");
}

/* ── ESTree side: only report locations ─────────────────────────────────── */

function exportNodes(program: ProgramNode): Map<string, ExportNode> {
  const nodes = new Map<string, ExportNode>();

  for (const node of program.body) {
    if (node.type === "ExportDefaultDeclaration") {
      nodes.set("default", node);
      continue;
    }
    if (node.type !== "ExportNamedDeclaration" || node.exportKind === "type") continue;

    if (node.declaration) {
      for (const name of declaredNames(node.declaration)) nodes.set(name, node);
      continue;
    }
    for (const specifier of node.specifiers ?? []) {
      if (specifier.exportKind === "type") continue;
      const name = specifier.exported.name ?? specifier.exported.value;
      if (name) nodes.set(name, node);
    }
  }

  return nodes;
}

function declaredNames(declaration: DeclarationNode): string[] {
  if (declaration.declarations) {
    return declaration.declarations.flatMap(({ id }) =>
      id.type === "Identifier" && id.name ? [id.name] : [],
    );
  }
  return declaration.id?.name ? [declaration.id.name] : [];
}

/**
 * A file-level `"use server"` directive, i.e. one anywhere in the directive
 * prologue — `"use strict"; "use server";` is a server-action module as far as
 * Next.js is concerned, so the scan runs until the first non-directive
 * statement rather than stopping at the first statement.
 *
 * Marking a single function body is out of scope: the exported binding there is
 * a plain function, not a module export the convention can speak about.
 */
function hasUseServerDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === "use server") return true;
  }
  return false;
}
