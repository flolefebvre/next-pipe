// The verb's body lives in `./handler`. Analysis must follow the alias across
// files (`getAliasedSymbol`) and still judge it usable.
export { GET } from "./handler.js";
