/**
 * The filesystem and module-resolution layer of the rule.
 *
 * The rule reasons about *other* files — the `pipe.ts` above the linted file,
 * the module a handler is re-exported from — which ESLint never hands it. So
 * everything is done on the TypeScript AST: files are parsed with
 * `ts.createSourceFile` and imports are resolved with `ts.resolveModuleName`
 * against the nearest `tsconfig.json`, so a project's `paths` aliases
 * (`@/app/admin/pipe`) resolve exactly as they do under `tsc`.
 *
 * No `ts.Program` and no type checker: a program over a whole Next.js app on
 * every lint pass would be far too slow, and every question this rule asks is
 * syntactic. Parsed files are cached by path + mtime, compiler options by the
 * tsconfig they came from.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import ts from "typescript";

/**
 * One absolute, comparable form for a path: forward slashes on every platform,
 * which is also what `ts.resolveModuleName` returns.
 */
export function normalizePath(file: string): string {
  return resolve(file).split(sep).join("/");
}

/**
 * Carries the text of the file ESLint is currently linting so that the very
 * same parse-and-walk code path serves both it and the files around it. Without
 * it the rule would read the linted file back from disk and miss unsaved edits
 * in an editor.
 */
export type Analyzer = {
  liveFile: string;
  liveText: string;
  /**
   * Filled on first use: the live file has no mtime to key a cache on, and it
   * is asked for once per checked export — seven times for a `route.ts` with
   * every verb. Parsing it that many times per lint is pure waste.
   */
  liveSource?: ts.SourceFile;
};

type ParsedFile = { mtimeMs: number; sourceFile: ts.SourceFile };

const parsedFiles = new Map<string, ParsedFile>();
const configPathByDir = new Map<string, string | undefined>();
const optionsByConfig = new Map<string, { mtimeMs: number; options: ts.CompilerOptions }>();
const resolutions = new Map<string, string | undefined>();

/** What a Next.js app uses, for the rare file with no tsconfig above it. */
const FALLBACK_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

function createSourceFile(file: string, text: string): ts.SourceFile {
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
}

/** The parsed form of `file`, from the live buffer when it is the linted one. */
export function sourceOf(analyzer: Analyzer, file: string): ts.SourceFile | undefined {
  if (file === analyzer.liveFile) {
    analyzer.liveSource ??= createSourceFile(file, analyzer.liveText);
    return analyzer.liveSource;
  }

  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return undefined;
  }

  const cached = parsedFiles.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.sourceFile;

  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }

  const sourceFile = createSourceFile(file, text);
  parsedFiles.set(file, { mtimeMs, sourceFile });
  return sourceFile;
}

/** True when `file` exists — how a `pipe.ts` is looked for while walking up. */
export function fileExists(file: string): boolean {
  return ts.sys.fileExists(file);
}

function compilerOptionsFor(file: string): ts.CompilerOptions {
  const dir = dirname(file);
  if (!configPathByDir.has(dir)) {
    configPathByDir.set(dir, ts.findConfigFile(dir, ts.sys.fileExists));
  }
  const configPath = configPathByDir.get(dir);
  if (!configPath) return FALLBACK_OPTIONS;

  let mtimeMs: number;
  try {
    mtimeMs = statSync(configPath).mtimeMs;
  } catch {
    return FALLBACK_OPTIONS;
  }

  const cached = optionsByConfig.get(configPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.options;

  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const options = read.error
    ? FALLBACK_OPTIONS
    : ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath)).options;
  optionsByConfig.set(configPath, { mtimeMs, options });
  return options;
}

/**
 * The local `.ts`/`.tsx` file `specifier` resolves to from `containingFile`, or
 * `undefined` when it resolves to nothing, to a declaration file, or into
 * `node_modules` — none of which can be a project's `pipe.ts`.
 */
export function resolveImport(specifier: string, containingFile: string): string | undefined {
  const key = `${dirname(containingFile)}|${specifier}`;
  if (resolutions.has(key)) return resolutions.get(key);

  const { resolvedModule } = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptionsFor(containingFile),
    ts.sys,
  );
  const resolved =
    resolvedModule &&
    !resolvedModule.isExternalLibraryImport &&
    /\.tsx?$/.test(resolvedModule.resolvedFileName) &&
    !resolvedModule.resolvedFileName.endsWith(".d.ts")
      ? normalizePath(resolvedModule.resolvedFileName)
      : undefined;

  resolutions.set(key, resolved);
  return resolved;
}
