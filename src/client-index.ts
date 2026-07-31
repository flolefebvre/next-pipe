// Transport layer
export { callRoute, defineRoute } from "./client.js";
export type { RouteDefinition, RouteBuilder, ParamsOf, BodyOf, ResponseOf } from "./client.js";

// Client hooks / helpers ("use client")
export { getActionError, getActionInput } from "./client-helpers.js";
export { useApiCall } from "./client-hooks.js";
