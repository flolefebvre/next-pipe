export type RouteParam = {
  /** Param name from the segment, e.g. "id" or "slug". */
  name: string;
  /** TS type of the param: `string` for `[id]`, `string[]` for catch-alls. */
  type: "string" | "string[]";
  /** Optional catch-all params (`[[...slug]]`) may be omitted. */
  optional: boolean;
};

export type ResolvedRoute = {
  /** Dynamic params along the path, in order of appearance. */
  params: RouteParam[];
  /** URL template body using `${...}` placeholders, with route groups stripped. */
  urlTemplate: string;
};

const GROUP = /^\(.+\)$/; // route group  (group)  -> never appears in the URL
const OPTIONAL_CATCH_ALL = /^\[\[\.\.\.(.+)\]\]$/; // optional catch-all  [[...slug]]  -> optional string[]
const CATCH_ALL = /^\[\.\.\.(.+)\]$/; // catch-all  [...slug]  -> required string[]
const DYNAMIC = /^\[(.+)\]$/; // dynamic segment  [id]  -> required string

/** A URL-relevant segment: route groups have already been dropped. */
export type Segment =
  | { type: "static"; value: string }
  | { type: "dynamic"; param: string }
  | { type: "catch-all"; param: string }
  | { type: "optional-catch-all"; param: string };

/** The dynamic param a segment introduces, or `null` for static segments. */
export function segmentParam(segment: Segment): RouteParam | null {
  switch (segment.type) {
    case "static":
      return null;
    case "dynamic":
      return { name: segment.param, type: "string", optional: false };
    case "catch-all":
      return { name: segment.param, type: "string[]", optional: false };
    case "optional-catch-all":
      return { name: segment.param, type: "string[]", optional: true };
  }
}

/**
 * Standalone, pure: parses an app-relative route directory into its
 * URL-relevant segments, with route groups `(group)` stripped from day one.
 * `relativeDir` is posix-separated with the trailing `route.ts` removed, e.g.
 * "api/posts/[id]/like" (or "" for the root route).
 *
 * Classification order matters: optional catch-all `[[...slug]]` is tested
 * before catch-all `[...slug]` before the plain dynamic `[id]`, since each
 * pattern is a substring of the previous one.
 *
 * Deferred route kinds — parallel / intercepting routes — slot in by extending
 * this per-segment classification, so every consumer (URL templating, the
 * barrel trie) benefits at once.
 */
export function parseSegments(relativeDir: string): Segment[] {
  const segments: Segment[] = [];

  for (const segment of relativeDir.split("/").filter(Boolean)) {
    if (GROUP.test(segment)) continue;

    const optionalCatchAll = OPTIONAL_CATCH_ALL.exec(segment);
    if (optionalCatchAll) {
      segments.push({
        type: "optional-catch-all",
        param: optionalCatchAll[1]!,
      });
      continue;
    }

    const catchAll = CATCH_ALL.exec(segment);
    if (catchAll) {
      segments.push({ type: "catch-all", param: catchAll[1]! });
      continue;
    }

    const dynamic = DYNAMIC.exec(segment);
    if (dynamic) segments.push({ type: "dynamic", param: dynamic[1]! });
    else segments.push({ type: "static", value: segment });
  }

  return segments;
}

/** The `${...}` placeholder a dynamic segment contributes to the URL template, with its leading "/". */
function urlPart(segment: Segment, isFirst: boolean): string {
  switch (segment.type) {
    case "static":
      return "/" + segment.value;
    case "dynamic":
      return "/${" + segment.param + "}";
    case "catch-all":
      return "/${" + segment.param + '.join("/")}';
    case "optional-catch-all": {
      // Absent → contributes nothing, except at the root where it must keep "/".
      const empty = isFirst ? "/" : "";
      return (
        "${" + segment.param + "?.length ? `/${" + segment.param + '.join("/")}` : "' + empty + '"}'
      );
    }
  }
}

/** Maps an app-relative route directory to a URL template + ordered params. */
export function resolveRoutePath(relativeDir: string): ResolvedRoute {
  const params: RouteParam[] = [];
  const parts: string[] = [];

  const segments = parseSegments(relativeDir);
  segments.forEach((segment, i) => {
    const param = segmentParam(segment);
    if (param) params.push(param);
    parts.push(urlPart(segment, i === 0));
  });

  return { params, urlTemplate: parts.join("") || "/" };
}
