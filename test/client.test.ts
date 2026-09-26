import { afterEach, describe, expect, it, vi } from "vitest";
import { Qwen, resolveModelName } from "../src/client";
import { QWEN3_CODER_480B, QWEN3_EMBEDDING_8B } from "../src/models/catalog";

const ollama = { name: "ollama", kind: "ollama" } as const;
const dashscope = { name: "dashscope", kind: "openai-compat" } as const;
const custom = { name: "custom", kind: "openai-compat" } as const;
const openrouter = {
  name: "custom",
  kind: "openai-compat",
  baseURL: "https://openrouter.ai/api/v1",
} as const;

describe("resolveModelName", () => {
  it("uses ollama tags for the ollama transport", () => {
    expect(resolveModelName(QWEN3_CODER_480B, ollama)).toBe("qwen3-coder:480b");
    expect(resolveModelName("qwen3-coder-480b", ollama)).toBe("qwen3-coder:480b");
    expect(resolveModelName("my-own-tag", ollama)).toBe("my-own-tag");
  });

  it("uses dashscope ids for dashscope", () => {
    expect(resolveModelName(QWEN3_EMBEDDING_8B, dashscope)).toBe("text-embedding-v4");
    expect(resolveModelName("qwen3-embedding:8b", dashscope)).toBe("text-embedding-v4");
  });

  it("preserves caller spelling for generic OpenAI-compatible hosts", () => {
    expect(resolveModelName("qwen3.8:27b", custom)).toBe("qwen3.8:27b");
    expect(resolveModelName("qwen3-coder-plus", custom)).toBe("qwen3-coder-plus");
    expect(resolveModelName(QWEN3_CODER_480B, custom)).toBe("qwen3-coder-480b");
  });

  it("uses openrouter ids on openrouter endpoints", () => {
    expect(resolveModelName(QWEN3_CODER_480B, openrouter)).toBe("qwen/qwen3-coder-plus");
    expect(resolveModelName("qwen3-coder-480b", openrouter)).toBe("qwen/qwen3-coder-plus");
    expect(resolveModelName("qwen/qwen3-coder-plus", openrouter)).toBe("qwen/qwen3-coder-plus");
  });

  it("falls back to the catalog id when an entry has no openrouter mapping", () => {
    expect(resolveModelName("qwen3.5-0.8b", openrouter)).toBe("qwen3.5-0.8b");
    expect(resolveModelName("my-own-tag", openrouter)).toBe("my-own-tag");
  });

  it("falls back when no model is given", () => {
    expect(resolveModelName(undefined, ollama, "qwen3.8:27b")).toBe("qwen3.8:27b");
    expect(() => resolveModelName(undefined, custom)).toThrow(/No model specified/);
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Qwen client integration", () => {
  it("resolves the default DashScope embedding alias", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ embedding: [0.1] }] }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new Qwen({
      provider: { name: "dashscope", baseURL: "http://mock.test/v1" },
      apiKey: "test-key",
    });
    await client.embed({ input: "hello" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe("text-embedding-v4");
  });

  it("returns an empty answer for null tool-call content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [{ id: "call_1", function: { name: "get", arguments: "{}" } }],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
      ),
    );

    const client = new Qwen({ provider: "http://mock.test/v1", model: "test-model" });
    await expect(client.say("hello")).resolves.toBe("");
  });
});
