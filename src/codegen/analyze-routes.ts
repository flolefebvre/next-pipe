import { dirname } from "node:path";
import ts from "typescript";

/**
 * Type-aware analysis of `route.ts` modules.
 *
 * The previous incarnation was a pure syntax pass: it walked top-level
 * `export const` statements and string-matched `ResponseMiddleware` to decide
 * whether a verb was usable. That missed three real scenarios:
 *
 *  1. `export async function GET() { ... }` — function declarations, not consts.
 *  2. `export { GET } from "./handler"` — re-exports, whose body lives elsewhere.
 *  3. `HEAD` / `OPTIONS` — valid Next.js route verbs that were never in the list.
 *
 * Enumerating a module's exports through the type-checker fixes all three at
 * once: aliases (re-exports) resolve across files, function declarations and
 * consts are treated uniformly, and "usable" becomes a *type fact* — does the
 * handler's awaited return type carry a `__MIDDLEWARE_CONFIG.output`? — rather
 * than a textual guess that can false-positive on a comment or an unused import.
 */

/**
 * HTTP methods a Next.js route handler may export.
 * See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
 */
export const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type Verb = (typeof VERBS)[number];

const VERB_INDEX = new Map<string, number>(VERBS.map((v, i) => [v, i]));

/**
 * A `unique symbol` used as a computed property key produces a late-bound
 * member whose internal name embeds the symbol's *variable* name, e.g.
 * `__@__MIDDLEWARE_CONFIG@123`. Matching on that name is how we locate the
 * handler config without depending on TypeScript internals.
 */
const CONFIG_MEMBER_HINT = "__MIDDLEWARE_CONFIG";

/** A verb export discovered on a route module. */
export type VerbExport = {
  name: Verb;
  /**
   * Whether the export's type carries a `__MIDDLEWARE_CONFIG.output`, i.e. a
   * `ResponseMiddleware` (or any middleware contributing `output`) was applied.
   * Only usable verbs get a generated client builder — an unusable one has no
   * response type to expose and would only fail `tsc`.
   */
  usable: boolean;
};

/** Reads and parses a `tsconfig.json` into a fully-resolved command line. */
export function parseTsconfig(tsconfigPath: string): ts.ParsedCommandLine {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(tsconfigPath));
}

/**
 * Builds a non-emitting program over `rootNames`. Module resolution pulls in
 * everything they import (`@/lib/...` via `paths`), so the route handlers'
 * pipe-chain types resolve exactly as they do under `tsc`.
 */
export function buildProgram(rootNames: string[], options: ts.CompilerOptions): ts.Program {
  return ts.createProgram({ rootNames, options: { ...options, noEmit: true } });
}

/**
 * Enumerates a route module's verb exports and whether each is usable.
 *
 * Pure given a checker: re-exports resolve through `getAliasedSymbol`, and
 * function declarations and consts arrive identically via `getExportsOfModule`.
 * Output is sorted into canonical verb order so generated files are stable.
 */
export function analyzeModule(checker: ts.TypeChecker, sourceFile: ts.SourceFile): VerbExport[] {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return [];

  const verbs: VerbExport[] = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const name = exported.getName();
    if (!VERB_INDEX.has(name)) continue;

    const target =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    verbs.push({ name: name as Verb, usable: carriesOutput(checker, target) });
  }

  verbs.sort((a, b) => VERB_INDEX.get(a.name)! - VERB_INDEX.get(b.name)!);
  return verbs;
}

/**
 * True when `symbol` is a handler whose awaited return type carries a
 * `__MIDDLEWARE_CONFIG.output` — the same contract `defineRoute` relies on to
 * extract the response type. This is what `ResponseMiddleware` contributes.
 */
function carriesOutput(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!declaration) return false;

  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  for (const signature of type.getCallSignatures()) {
    const returnType = checker.getReturnTypeOfSignature(signature);
    const awaited = checker.getAwaitedType(returnType) ?? returnType;

    const config = awaited
      .getProperties()
      .find((property) => property.getName().includes(CONFIG_MEMBER_HINT));
    if (!config) continue;

    const configType = checker.getTypeOfSymbolAtLocation(config, declaration);
    if (configType.getProperty("output")) return true;
  }
  return false;
}
