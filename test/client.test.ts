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

  it("normalizes known models to catalog ids for generic OpenAI-compatible hosts", () => {
    expect(resolveModelName("qwen3.8:27b", custom)).toBe("qwen3.8-27b");
    expect(resolveModelName("qwen3-coder-plus", custom)).toBe("qwen3-coder-480b");
    expect(resolveModelName(QWEN3_CODER_480B, custom)).toBe("qwen3-coder-480b");
    expect(resolveModelName("my-own-tag", custom)).toBe("my-own-tag");
  });

  it("uses openrouter ids on openrouter endpoints", () => {
    expect(resolveModelName(QWEN3_CODER_480B, openrouter)).toBe("qwen/qwen3-coder-plus");
    expect(resolveModelName("qwen3-coder-480b", openrouter)).toBe("qwen/qwen3-coder-plus");
    expect(resolveModelName("qwen/qwen3-coder-plus", openrouter)).toBe("qwen/qwen3-coder-plus");
  });

  it("throws when a known entry has no mapping for the endpoint", () => {
    expect(() => resolveModelName("qwen3.5-0.8b", openrouter)).toThrow(/no OpenRouter id/);
    expect(() => resolveModelName("qwen3.8-max", ollama)).toThrow(/no Ollama tag/);
    expect(resolveModelName("my-own-tag", openrouter)).toBe("my-own-tag");
  });

  it("falls back when no model is given", () => {
    expect(resolveModelName(undefined, ollama, "qwen3.8:27b")).toBe("qwen3.8:27b");
    expect(() => resolveModelName(undefined, custom)).toThrow(/No model specified/);
  });

  it("rejects empty model ids", () => {
    expect(() => resolveModelName("", custom)).toThrow(/must not be empty/);
    expect(() => resolveModelName({ id: "  " }, custom)).toThrow(/must not be empty/);
  });

  it("detects dashscope through proxied base URLs", () => {
    const proxied = {
      name: "custom",
      kind: "openai-compat",
      baseURL: "https://gateway.example/v1",
    } as const;
    expect(resolveModelName(QWEN3_CODER_480B, proxied)).toBe("qwen3-coder-480b");
    const dashProxy = {
      name: "custom",
      kind: "openai-compat",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    } as const;
    expect(resolveModelName(QWEN3_CODER_480B, dashProxy)).toBe("qwen3-coder-plus");
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

  it("refuses to embed with a chat model but falls back from a chat default", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String((init as RequestInit).body)));
        return jsonResponse({ data: [{ embedding: [0.1] }] });
      }),
    );

    const explicit = new Qwen({ provider: "http://mock.test/v1", model: "qwen3-32b" });
    expect(() => explicit.embed({ model: "qwen3-32b", input: "hi" })).toThrow(
      /does not support embeddings/,
    );

    const implicit = new Qwen({ provider: "http://mock.test/v1", model: "qwen3-32b" });
    await implicit.embed({ input: "hi" });
    expect((bodies.at(-1) as { model: string }).model).toBe("qwen3-embedding-8b");
  });

  it("validates model objects instead of trusting them", () => {
    const client = new Qwen({ provider: "http://mock.test/v1", model: "qwen3-32b" });
    expect(client.model({ id: "definitely-fake" })?.id).toBeUndefined();
    expect(client.model(QWEN3_CODER_480B)?.id).toBe("qwen3-coder-480b");
  });

  it("applies the client timeoutMs by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("timed out", "TimeoutError"));
            });
          }),
      ),
    );
    const client = new Qwen({ provider: "http://mock.test/v1", model: "m", timeoutMs: 10 });
    await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      /timed out/,
    );
  });

  it("exposes top-level sayStream and embed helpers", async () => {
    const { sayStream, embed } = await import("../src/client");
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\ndata: [DONE]\n\n`,
                  ),
                );
                controller.close();
              },
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(sayStream("hi", { provider: "http://mock.test/v1", model: "m" })).resolves.toBe(
      "ok",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: [{ embedding: [0.2] }] })),
    );
    const out = await embed({ input: "hi", provider: "http://mock.test/v1", model: "m" });
    expect(out.embeddings).toEqual([[0.2]]);
  });
});
