import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli/args";

describe("parseCliArgs", () => {
  it("treats positionals as the prompt", () => {
    const flags = parseCliArgs(["explain", "this", "repo"]);
    expect(flags.positionals).toEqual(["explain", "this", "repo"]);
  });

  it("parses flags", () => {
    const flags = parseCliArgs([
      "-m",
      "qwen3-32b",
      "-p",
      "ollama",
      "-s",
      "be terse",
      "-t",
      "0.2",
      "--max-tokens",
      "64",
      "--thinking",
      "--json",
    ]);
    expect(flags.model).toBe("qwen3-32b");
    expect(flags.provider).toBe("ollama");
    expect(flags.system).toBe("be terse");
    expect(flags.temperature).toBe(0.2);
    expect(flags.maxTokens).toBe(64);
    expect(flags.thinking).toBe(true);
    expect(flags.json).toBe(true);
  });

  it("supports --no-thinking", () => {
    expect(parseCliArgs(["--no-thinking"]).thinking).toBe(false);
  });

  it("detects subcommands as positionals", () => {
    const flags = parseCliArgs(["models", "--local"]);
    expect(flags.positionals[0]).toBe("models");
    expect(flags.local).toBe(true);
  });

  it("rejects unknown --use values", () => {
    expect(() => parseCliArgs(["--use", "dancing"])).toThrow(/--use must be one of/);
  });

  it("rejects invalid --max-params values", () => {
    expect(() => parseCliArgs(["--max-params", "nonsense"])).toThrow(/--max-params/);
  });

  it("rejects invalid numeric options", () => {
    expect(() => parseCliArgs(["--temperature", "nonsense"])).toThrow(/--temperature/);
    expect(() => parseCliArgs(["--max-tokens", "1.5"])).toThrow(/--max-tokens/);
    expect(() => parseCliArgs(["--thinking-budget", "-1"])).toThrow(/--thinking-budget/);
    expect(() => parseCliArgs(["--top", "0"])).toThrow(/--top/);
  });

  it("ignores --no-thinking after -- and inside option values", () => {
    const afterDash = parseCliArgs(["--thinking", "--", "--no-thinking"]);
    expect(afterDash.thinking).toBe(true);
    expect(afterDash.positionals).toEqual(["--no-thinking"]);

    const inSystem = parseCliArgs(["--thinking", "--system=--no-thinking", "hi"]);
    expect(inSystem.thinking).toBe(true);
    expect(inSystem.system).toBe("--no-thinking");

    const inPrompt = parseCliArgs(["--thinking", "--prompt=--no-thinking"]);
    expect(inPrompt.thinking).toBe(true);
    expect(inPrompt.prompt).toBe("--no-thinking");
  });
});
