import type { JsonValue } from "./types.js";

/**
 * TYPES
 */

/**
 * FUNCTIONS
 */

function json<Status extends number, TJson extends JsonValue>(status: Status, json: TJson) {
  return {
    status,
    json,
  };
}

export { json };
