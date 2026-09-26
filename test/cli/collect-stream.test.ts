import { describe, expect, it } from "vitest";
import { collectStreamText } from "../../src/cli/collect-stream";
import type { ChatChunk } from "../../src/types";

function chunk(delta: ChatChunk["delta"]): ChatChunk {
  return { id: "1", model: "m", delta, finishReason: null };
}

describe("collectStreamText", () => {
  it("keeps content that arrives with reasoning in the same chunk", async () => {
    const seen: string[] = [];
    const result = await collectStreamText(
      (async function* () {
        yield chunk({ reasoningContent: "think" });
        yield chunk({ content: "hello", reasoningContent: "more" });
        yield chunk({ content: " world" });
      })(),
      (text: string) => seen.push(text),
    );
    expect(result.answer).toBe("hello world");
    expect(result.reasoning).toBe("thinkmore");
    expect(seen).toEqual(["hello", " world"]);
  });

  it("handles an empty stream", async () => {
    const result = await collectStreamText(
      (async function* () {
        // no chunks
      })(),
    );
    expect(result).toEqual({ answer: "", reasoning: "" });
  });

  it("keeps the last usage reported by the stream", async () => {
    const result = await collectStreamText(
      (async function* () {
        yield {
          ...chunk({ content: "hi" }),
          usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
        };
        yield {
          ...chunk({ content: " there" }),
          usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
        };
      })(),
    );
    expect(result.answer).toBe("hi there");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2, totalTokens: 12 });
  });
});
