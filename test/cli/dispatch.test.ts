import { afterEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "../../src";
import { parseCliArgs } from "../../src/cli/args";

const { mockRunRepl } = vi.hoisted(() => ({
  mockRunRepl: vi.fn(async () => undefined),
}));

vi.mock("../../src/cli/repl", () => ({
  runRepl: mockRunRepl,
}));

import { main, resolveChatTarget } from "../../src/cli/index";
import { resolveModel } from "../../src/models";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("main dispatch", () => {
  it("prints the package version rather than 0.0.0", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    await expect(main(["--version"])).resolves.toBe(0);
    expect(writes.join("")).toBe(`${VERSION}\n`);
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

  it("routes bare -l and --json to chat when stdin is piped and to REPL with chat flags", async () => {
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/api/chat")) {
        return new Response(
          `${JSON.stringify({ model: "qwen3.8:27b", message: { content: "local ok" }, done: true })}\n`,
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          id: "1",
          model: "qwen3.8-flash",
          choices: [{ message: { role: "assistant", content: "json ok" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(main(["-l"], { stdin: "hi" })).resolves.toBe(0);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/chat");
    expect(stdoutWrites.join("")).toContain("local ok");

    stdoutWrites.length = 0;
    await expect(main(["--json"], { stdin: "hi" })).resolves.toBe(0);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/chat/completions");
    const jsonOut = JSON.parse(stdoutWrites.join("")) as { message: { content: string } };
    expect(jsonOut.message.content).toBe("json ok");

    await expect(main(["-l", "-m", "qwen3.8:27b"])).resolves.toBe(0);
    await expect(main(["-l", "--thinking"])).resolves.toBe(0);
    expect(mockRunRepl).toHaveBeenCalledTimes(2);
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
      /requires? thinking/,
    );
    expect(() => parseCliArgs(["--no-thinking", "--reasoning-effort", "low"])).toThrow(
      /requires? thinking/,
    );
    expect(() => parseCliArgs(["--thinking-budget", "512", "--reasoning-effort", "low"])).toThrow(
      /cannot be combined/,
    );
  });

  it("parses reasoning effort and preserve thinking", () => {
    const flags = parseCliArgs(["--reasoning-effort", "xhigh", "--preserve-thinking"]);
    expect(flags.reasoningEffort).toBe("xhigh");
    expect(flags.preserveThinking).toBe(true);
    expect(() => parseCliArgs(["--reasoning-effort", "max"])).toThrow(/one of low, medium, xhigh/);
  });

  it("accepts t/m max-params units and rejects unknown --use", () => {
    expect(parseCliArgs(["--max-params", "2.4T"]).maxParams).toBe("2.4t");
    expect(() => parseCliArgs(["--use", "dancing"])).toThrow(/--use must be one of/);
  });
});
