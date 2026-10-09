import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli/args";
import { main, resolveChatTarget } from "../../src/cli/index";
import { resolveModel } from "../../src/models";

describe("main dispatch", () => {
  it("prints the version", async () => {
    await expect(main(["--version"])).resolves.toBe(0);
  });

  it("lists models offline", async () => {
    await expect(main(["models"])).resolves.toBe(0);
  });

  it("shows command help for help <cmd>", async () => {
    await expect(main(["help", "models"])).resolves.toBe(0);
  });

  it("rejects unknown help topics", async () => {
    await expect(main(["help", "bogus"])).resolves.toBe(2);
  });

  it("rejects bad pull arity", async () => {
    await expect(main(["pull"])).resolves.toBe(2);
    await expect(main(["pull", "a", "b"])).resolves.toBe(2);
  });

  it("recommends a DashScope-mapped model by default", () => {
    const target = resolveChatTarget({ positionals: [] });
    expect(resolveModel(target.model)?.dashscopeId).toBeTruthy();
  });

  it("recommends offline for bare --top", async () => {
    await expect(main(["--top", "1"])).resolves.toBe(0);
  });

  it("rejects --top with a prompt and --json with --quiet", async () => {
    await expect(main(["hello", "--top", "3"])).resolves.toBe(2);
    await expect(main(["recommend", "hello", "--top", "3"])).resolves.toBe(2);
    await expect(main(["--json", "--quiet", "hello"])).resolves.toBe(2);
  });

  it("rejects --prompt combined with positional words", async () => {
    await expect(main(["--prompt", "sum", "extra"])).resolves.toBe(2);
  });
});

describe("parseCliArgs edges", () => {
  it("lets the last thinking flag win in both orders", () => {
    expect(parseCliArgs(["--no-thinking", "--thinking"]).thinking).toBe(true);
    expect(parseCliArgs(["--thinking", "--no-thinking"]).thinking).toBe(false);
  });

  it("rejects empty string flags", () => {
    expect(() => parseCliArgs(["--model", ""])).toThrow(/must not be empty/);
    expect(() => parseCliArgs(["--provider", ""])).toThrow(/must not be empty/);
    expect(() => parseCliArgs(["--use", ""])).toThrow(/--use must be one of/);
  });

  it("rejects contradictory thinking options", () => {
    expect(() => parseCliArgs(["--no-thinking", "--thinking-budget", "512"])).toThrow(
      /requires thinking/,
    );
  });

  it("accepts t/m max-params units and rejects unknown --use", () => {
    expect(parseCliArgs(["--max-params", "2.4T"]).maxParams).toBe("2.4t");
    expect(() => parseCliArgs(["--use", "dancing"])).toThrow(/--use must be one of/);
  });
});
