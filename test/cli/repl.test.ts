import { afterEach, describe, expect, it, vi } from "vitest";
import type { Qwen } from "../../src/client";
import type { ChatChunk } from "../../src/types";

const { mockQuestion, mockClose } = vi.hoisted(() => ({
  mockQuestion: vi.fn(),
  mockClose: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({ question: mockQuestion, close: mockClose })),
}));

vi.mock("../../src/cli/spinner", () => ({
  startSpinner: vi.fn(() => ({ stop: vi.fn() })),
}));

import { type ReplOptions, runRepl } from "../../src/cli/repl";

function chunk(delta: ChatChunk["delta"]): ChatChunk {
  return { id: "1", model: "m", delta, finishReason: "stop" };
}

function clientReturning(chunks: ChatChunk[]) {
  return {
    model: () => undefined,
    config: { name: "ollama", kind: "ollama", baseURL: "http://localhost:11434" },
    chatStream: vi.fn(async function* () {
      for (const c of chunks) yield c;
    }),
  } as unknown as Qwen;
}

function options(client: Qwen): ReplOptions {
  return { client, model: "qwen3.8:27b" };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("runRepl commands", () => {
  it("shows help and reports unknown commands", async () => {
    mockQuestion
      .mockResolvedValueOnce("/help")
      .mockResolvedValueOnce("/bogus-cmd")
      .mockResolvedValueOnce("/exit");
    const lines: string[] = [];
    await runRepl(options(clientReturning([])), (s) => lines.push(s));
    expect(lines.some((l) => l.includes("REPL commands"))).toBe(true);
    expect(lines.some((l) => l.includes("Unknown command /bogus-cmd"))).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });

  it("rejects /thinking garbage and supports auto", async () => {
    mockQuestion
      .mockResolvedValueOnce("/thinking banana")
      .mockResolvedValueOnce("/thinking auto")
      .mockResolvedValueOnce("/exit");
    const lines: string[] = [];
    await runRepl(options(clientReturning([])), (s) => lines.push(s));
    expect(lines.some((l) => l.includes("usage: /thinking on|off|auto"))).toBe(true);
    expect(lines.some((l) => l.includes("thinking: auto"))).toBe(true);
  });

  it("rejects multi-word /model args", async () => {
    mockQuestion.mockResolvedValueOnce("/model foo bar").mockResolvedValueOnce("/exit");
    const lines: string[] = [];
    await runRepl(options(clientReturning([])), (s) => lines.push(s));
    expect(lines.some((l) => l.includes("usage: /model <id>"))).toBe(true);
  });

  it("sends //-escaped lines to the model", async () => {
    const client = clientReturning([chunk({ content: "hi" })]);
    mockQuestion.mockResolvedValueOnce("///tmp/x").mockResolvedValueOnce("/exit");
    const lines: string[] = [];
    await runRepl(options(client), (s) => lines.push(s));
    const sent = (client.chatStream as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    expect(sent.messages[0]?.content).toBe("//tmp/x");
  });

  it("rolls back failed turns without duplicating history", async () => {
    const failing = {
      model: () => undefined,
      config: { name: "ollama", kind: "ollama", baseURL: "http://localhost:11434" },
      chatStream: vi.fn(() => {
        throw new Error("down");
      }),
    } as unknown as Qwen;
    mockQuestion.mockResolvedValueOnce("first").mockResolvedValueOnce("/exit");
    const lines: string[] = [];
    await runRepl(options(failing), (s) => lines.push(s));
    expect(lines.some((l) => l.includes("error: down"))).toBe(true);
  });

  it("discards reasoning-only turns", async () => {
    const client = clientReturning([chunk({ reasoningContent: "hmm" })]);
    mockQuestion.mockResolvedValueOnce("think").mockResolvedValueOnce("/exit");
    const lines: string[] = [];
    await runRepl(options(client), (s) => lines.push(s));
    expect(lines.some((l) => l.includes("empty answer discarded"))).toBe(true);
    expect((client.chatStream as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
