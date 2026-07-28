import { notFound } from "next/navigation.js";
import * as z from "zod";
import { BeforeMiddleware, next } from "../../core.js";

/**
 * Validates a page's `searchParams` against a zod schema and merges the parsed
 * result as `query`. Requires the pipe to carry `searchParams` — i.e. a
 * `pagePipe<PageProps<"...">>()` with the generic supplied.
 *
 * A query string that fails the schema renders the 404 page (`notFound()`).
 * Prefer encoding leniency in the schema itself — `z.coerce.number().catch(1)`
 * — so bad-but-harmless params fall back instead of 404ing.
 */
export class SearchParamsMiddleware<TSchema extends z.ZodObject> extends BeforeMiddleware {
  constructor(private schema: TSchema) {
    super();
  }

  async before(arg: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const parse = this.schema.safeParse(await arg.searchParams);
    if (!parse.success) notFound();
    return next({ query: parse.data });
  }
}
