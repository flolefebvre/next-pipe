/**
 * Every published `exports` subpath, imported the way a consumer imports it.
 *
 * Nothing is asserted here — this file exists so that each entrypoint's
 * declarations are pulled into the program and checked. Shape assertions live
 * in the sibling `*.consumer.ts` files.
 */

import {
  Pipe,
  entry,
  createPipe,
  next,
  interrupt,
  success,
  error,
  merge,
  json,
} from "@flefebvre/next-pipe/server";
import type {
  ActionSuccess,
  ActionError,
  ActionResult,
  JsonValue,
  JsonObject,
  JsonArray,
  JsonPrimitive,
} from "@flefebvre/next-pipe/server";
import { callRoute, defineRoute, getActionError, useApiCall } from "@flefebvre/next-pipe/client";
import type {
  RouteDefinition,
  RouteBuilder,
  ParamsOf,
  BodyOf,
  ResponseOf,
} from "@flefebvre/next-pipe/client";
import { routePipe, pagePipe, actionPipe, formActionPipe } from "@flefebvre/next-pipe/pipes";
import {
  Middleware,
  BeforeMiddleware,
  AfterMiddleware,
  OutputTypeMiddleware,
} from "@flefebvre/next-pipe/middlewares";
import type { Apply, MiddlewareConfig } from "@flefebvre/next-pipe/middlewares";
import {
  ResponseMiddleware,
  BodyValidationMiddleware,
  QuerystringMiddleware,
} from "@flefebvre/next-pipe/middlewares/routes";
import { InputValidationMiddleware } from "@flefebvre/next-pipe/middlewares/actions";
import { FormValidationMiddleware } from "@flefebvre/next-pipe/middlewares/form-actions";
import { SearchParamsMiddleware } from "@flefebvre/next-pipe/middlewares/pages";

export {
  Pipe,
  entry,
  createPipe,
  next,
  interrupt,
  success,
  error,
  merge,
  json,
  callRoute,
  defineRoute,
  getActionError,
  useApiCall,
  routePipe,
  pagePipe,
  actionPipe,
  formActionPipe,
  Middleware,
  BeforeMiddleware,
  AfterMiddleware,
  OutputTypeMiddleware,
  ResponseMiddleware,
  BodyValidationMiddleware,
  QuerystringMiddleware,
  InputValidationMiddleware,
  FormValidationMiddleware,
  SearchParamsMiddleware,
};
export type {
  ActionSuccess,
  ActionError,
  ActionResult,
  JsonValue,
  JsonObject,
  JsonArray,
  JsonPrimitive,
  RouteDefinition,
  RouteBuilder,
  ParamsOf,
  BodyOf,
  ResponseOf,
  Apply,
  MiddlewareConfig,
};
