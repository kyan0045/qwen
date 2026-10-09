import { afterEach, describe, expect, it, vi } from "vitest";
import { APIError, ConfigurationError, ConnectionError } from "../../src/errors";
import { createDashScopeTransport, dashscopeProviderConfig } from "../../src/providers/dashscope";
import { createOllamaTransport } from "../../src/providers/ollama";
import { parseChatResponse } from "../../src/providers/openai-compat";
import { createOpenAICompatTransport } from "../../src/providers/openai-compat";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function streamResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transport error mapping", () => {
  it("wraps fetch rejections in ConnectionError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );
    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://mock.test" });
    await expect(
      transport.chat({ model: "qwen3.8:27b", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(ConnectionError);
  });

  it("drops non-numeric Retry-After headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "slow" } }), {
            status: 429,
            headers: { "retry-after": "soon", "content-type": "application/json" },
          }),
      ),
    );
    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://mock.test" });
    const error = await transport
      .chat({ model: "qwen3.8:27b", messages: [{ role: "user", content: "hi" }] })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ name: "RateLimitError", retryAfter: undefined });
  });

  it("rejects invalid timeoutMs values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({})),
    );
    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://mock.test" });
    await expect(
      transport.chat({ model: "m", messages: [] }, { timeoutMs: Number.NaN }),
    ).rejects.toThrow(/Invalid timeoutMs/);
  });

  it("maps timeout aborts to ConnectionError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("signal timed out", "TimeoutError"));
            });
          }),
      ),
    );
    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://mock.test" });
    await expect(
      transport.chat({ model: "m", messages: [] }, { timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(ConnectionError);
  });
});

describe("dashscope thinking shapes", () => {
  async function sentBody(req: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: "1", choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const transport = createDashScopeTransport(dashscopeProviderConfig(true, "sk-test"));
    await transport.chat({
      model: "qwen3-coder-plus",
      messages: [{ role: "user", content: "hi" }],
      ...req,
    } as never);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  it("implies enable_thinking from a lone budget", async () => {
    const body = await sentBody({ thinkingBudget: 512 });
    expect(body.enable_thinking).toBe(true);
    expect(body.thinking_budget).toBe(512);
  });

  it("drops the budget when thinking is off", async () => {
    const body = await sentBody({ thinking: false, thinkingBudget: 512 });
    expect(body.enable_thinking).toBe(false);
    expect(body).not.toHaveProperty("thinking_budget");
  });
});

describe("ollama streams and payloads", () => {
  const transport = () => createOllamaTransport({ name: "ollama", baseURL: "http://mock.test" });

  it("skips corrupt lines and reports unknown finish reasons as null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          "not json\n",
          `${JSON.stringify({ message: { content: "hi" } })}\n`,
          `${JSON.stringify({ done: true, done_reason: "weird" })}\n`,
        ]),
      ),
    );
    const chunks = [];
    for await (const chunk of transport().chatStream({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(2);
    expect(chunks[1]?.finishReason).toBeNull();
  });

  it("throws on streams without usable events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse(["nope\n", "still nope\n"])),
    );
    await expect(
      (async () => {
        for await (const _ of transport().chatStream({
          model: "m",
          messages: [],
        })) {
          // drain
        }
      })(),
    ).rejects.toBeInstanceOf(APIError);
  });

  it("pulls with progress and surfaces error rows as APIError", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          `${JSON.stringify({ status: "pulling", completed: 1, total: 2 })}\n`,
          `${JSON.stringify({ status: "done", completed: 2, total: 2 })}\n`,
        ]),
      ),
    );
    await transport().pullModel("qwen3.8:27b", {
      onProgress: (p) => seen.push(p.status),
    });
    expect(seen).toEqual(["pulling", "done"]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse([`${JSON.stringify({ error: "denied" })}\n`])),
    );
    await expect(transport().pullModel("qwen3.8:27b")).rejects.toBeInstanceOf(APIError);
  });

  it("requires a model for chat calls", async () => {
    await expect(
      transport().chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });
});

describe("openai-compat strictness", () => {
  const transport = () =>
    createOpenAICompatTransport({ name: "test", baseURL: "http://mock.test" });

  it("rejects choice-less payloads", () => {
    expect(() => parseChatResponse({})).toThrow(/missing choices/);
    expect(() => parseChatResponse({ choices: [] })).toThrow(/missing choices/);
  });

  it("rejects empty streams and malformed embeddings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse(["oops\n"])),
    );
    await expect(
      (async () => {
        for await (const _ of transport().chatStream({ model: "m", messages: [] })) {
          // drain
        }
      })(),
    ).rejects.toBeInstanceOf(APIError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: [{ embedding: "x" }] })),
    );
    await expect(transport().embed({ model: "m", input: "hi" })).rejects.toBeInstanceOf(APIError);
  });

  it("requires a model for chat and embed calls", async () => {
    await expect(
      transport().chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(ConfigurationError);
    await expect(transport().embed({ input: "hi" })).rejects.toBeInstanceOf(ConfigurationError);
  });
});
