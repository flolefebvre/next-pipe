import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runCli } from "./index.js";

const fakes = () => ({ gen: vi.fn(), agentsMd: vi.fn(() => 7) });

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

test.each([[[]], [["--help"]], [["-h"]]])("%j prints help and runs nothing", (argv) => {
  const commands = fakes();
  expect(runCli(argv, commands)).toBe(0);
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining("agents-md"));
  expect(commands.gen).not.toHaveBeenCalled();
  expect(commands.agentsMd).not.toHaveBeenCalled();
});

test("gen forwards the remaining args", () => {
  const commands = fakes();
  expect(runCli(["gen", "--app-dir", "x"], commands)).toBe(0);
  expect(commands.gen).toHaveBeenCalledWith(["--app-dir", "x"]);
});

test("flags with no subcommand still run gen", () => {
  const commands = fakes();
  expect(runCli(["--app-dir", "x"], commands)).toBe(0);
  expect(commands.gen).toHaveBeenCalledWith(["--app-dir", "x"]);
});

test("agents-md forwards the remaining args and its exit code", () => {
  const commands = fakes();
  expect(runCli(["agents-md", "--print"], commands)).toBe(7);
  expect(commands.agentsMd).toHaveBeenCalledWith(["--print"]);
});

test("an unknown command exits 1 and runs nothing", () => {
  const commands = fakes();
  expect(runCli(["bogus"], commands)).toBe(1);
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"bogus"'));
  expect(commands.gen).not.toHaveBeenCalled();
  expect(commands.agentsMd).not.toHaveBeenCalled();
});
