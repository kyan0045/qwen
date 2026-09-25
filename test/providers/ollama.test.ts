import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashScopeTransport, dashscopeProviderConfig } from "../../src/providers/dashscope";
import { createOllamaTransport } from "../../src/providers/ollama";
import type { ChatRequest } from "../../src/types";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ollama transport", () => {
  it("posts to /api/chat with think and options mapping", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        model: "qwen3.8:27b",
        created_at: "2026-01-01T00:00:00Z",
        message: { role: "assistant", content: "hi", thinking: "step" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 4,
        eval_count: 2,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://localhost:11434" });
    const req: ChatRequest = {
      model: "qwen3.8:27b",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.2,
      maxTokens: 64,
      thinking: true,
    };
    const response = await transport.chat(req);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(false);
    expect(body.think).toBe(true);
    expect(body.options.temperature).toBe(0.2);
    expect(body.options.num_predict).toBe(64);

    expect(response.message.content).toBe("hi");
    expect(response.message.reasoningContent).toBe("step");
    expect(response.usage?.totalTokens).toBe(6);
  });

  it("preserves reasoning content as Ollama thinking history", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        model: "qwen3.8:27b",
        message: { role: "assistant", content: "done" },
        done: true,
        done_reason: "stop",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://localhost:11434" });
    await transport.chat({
      model: "qwen3.8:27b",
      messages: [
        { role: "user", content: "continue" },
        { role: "assistant", content: "working", reasoningContent: "why this works" },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const messages = JSON.parse(String(init.body)).messages as Record<string, unknown>[];
    expect(messages[1]?.thinking).toBe("why this works");
  });

  it("sends Ollama image data instead of remote URLs", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ model: "qwen3-vl:32b", message: { content: "a photo" }, done: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://localhost:11434" });
    await transport.chat({
      model: "qwen3-vl:32b",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe this" },
            { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
          ],
        },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const messages = JSON.parse(String(init.body)).messages as Record<string, unknown>[];
    expect(messages[0]?.images).toEqual(["QUJD"]);
  });

  it("rejects remote image URLs that Ollama cannot consume", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://localhost:11434" });
    await expect(
      transport.chat({
        model: "qwen3-vl:32b",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "describe this" },
              { type: "image_url", image_url: { url: "https://example.test/photo.png" } },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/base64-encoded image data/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists local models from /api/tags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          models: [
            {
              name: "qwen3.8:27b",
              model: "qwen3.8:27b",
              size: 18_000_000_000,
              details: { parameter_size: "27B", quantization_level: "Q4_K_M" },
            },
          ],
        }),
      ),
    );
    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://localhost:11434" });
    const models = await transport.listLocalModels();
    expect(models[0]?.tag).toBe("qwen3.8:27b");
    expect(models[0]?.parameterSize).toBe("27B");
    expect(models[0]?.quantization).toBe("Q4_K_M");
  });

  it("embeds via /api/embed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ embeddings: [[0.1, 0.2, 0.3]], prompt_eval_count: 5 })),
    );
    const transport = createOllamaTransport({ name: "ollama", baseURL: "http://localhost:11434" });
    const response = await transport.embed({ model: "qwen3-embedding:8b", input: "hi" });
    expect(response.embeddings[0]).toHaveLength(3);
    expect(response.dimensions).toBe(3);
    expect(response.usage?.promptTokens).toBe(5);
  });

  it("refuses pull on non-ollama transports", async () => {
    const transport = createDashScopeTransport(dashscopeProviderConfig(true, "sk-test"));
    await expect(transport.pullModel("qwen3.8:27b")).rejects.toThrow(
      /only supported on the Ollama/,
    );
  });
});

describe("dashscope transport", () => {
  it("injects enable_thinking and thinking_budget into the body", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: "1",
        model: "qwen3-coder-plus",
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const transport = createDashScopeTransport(dashscopeProviderConfig(true, "sk-test"));
    await transport.chat({
      model: "qwen3-coder-plus",
      messages: [{ role: "user", content: "hi" }],
      thinking: true,
      thinkingBudget: 512,
      enableSearch: true,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.enable_thinking).toBe(true);
    expect(body.thinking_budget).toBe(512);
    expect(body.enable_search).toBe(true);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
  });

  it("maps embedding instruction and retrieval role separately", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ embedding: [0.1] }] }));
    vi.stubGlobal("fetch", fetchMock);

    const transport = createDashScopeTransport(dashscopeProviderConfig(true, "sk-test"));
    await transport.embed({
      model: "text-embedding-v4",
      input: "research papers",
      dimensions: 1024,
      instruction: "Given a query, retrieve relevant papers",
      textType: "query",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.text_type).toBe("query");
    expect(body.instruct).toBe("Given a query, retrieve relevant papers");
  });

  it("rejects dimensions above the text-embedding-v4 maximum", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const transport = createDashScopeTransport(dashscopeProviderConfig(true, "sk-test"));
    await expect(
      transport.embed({ model: "text-embedding-v4", input: "hello", dimensions: 4096 }),
    ).rejects.toThrow(/up to 2048 dimensions/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the international base URL by default and the CN one on request", () => {
    expect(dashscopeProviderConfig(true).baseURL).toContain("dashscope-intl.aliyuncs.com");
    expect(dashscopeProviderConfig(false).baseURL).toContain("dashscope.aliyuncs.com");
    expect(dashscopeProviderConfig(false).baseURL).not.toContain("intl");
  });
});

describe("errors", () => {
  it("maps 401 and 429 to typed errors", async () => {
    const { errorFromResponse, AuthenticationError, RateLimitError } = await import(
      "../../src/errors"
    );
    const auth = errorFromResponse(401, { error: { message: "bad key" } });
    expect(auth).toBeInstanceOf(AuthenticationError);
    expect(auth.message).toBe("bad key");

    const limited = errorFromResponse(429, { error: { message: "slow down" } }, 30);
    expect(limited).toBeInstanceOf(RateLimitError);
    expect((limited as InstanceType<typeof RateLimitError>).retryAfter).toBe(30);
  });
});
