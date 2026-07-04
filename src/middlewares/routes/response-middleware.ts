import type { JsonValue } from "../../types.js";
import { AfterMiddleware, type MiddlewareConfig } from "../../core.js";
import { NextResponse } from "next/server.js";

export class ResponseMiddleware extends AfterMiddleware<{
  status: number;
  json: JsonValue;
}> {
  async after(output: this["After"]) {
    return NextResponse.json(output.json, { status: output.status });
  }
  declare config: MiddlewareConfig<"output", this["After"]>;
}
