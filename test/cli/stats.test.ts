import { describe, expect, it } from "vitest";
import { formatStats } from "../../src/cli/stats";

describe("formatStats", () => {
  it("shows model, tokens, speed and elapsed time when usage is known", () => {
    expect(
      formatStats("qwen3-coder-plus", { promptTokens: 123, completionTokens: 45, totalTokens: 168 }, 3000),
    ).toBe("[qwen3-coder-plus · prompt 123 · completion 45 · 15.0 tokens/s · 3.0s total]");
  });

  it("falls back to model and wall time when the provider sent no usage", () => {
    expect(formatStats("qwen3-coder-plus", undefined, 250)).toBe("[qwen3-coder-plus · 0.3s total]");
  });

  it("never divides by zero on instant responses", () => {
    expect(
      formatStats("m", { promptTokens: 1, completionTokens: 5, totalTokens: 6 }, 0),
    ).toContain("tokens/s");
  });
});
