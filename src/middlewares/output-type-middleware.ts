import { AfterMiddleware } from "../core.js";

export class OutputTypeMiddleware<T> extends AfterMiddleware<T> {
  async after(t: this["After"]) {
    return t;
  }
}
