import { describe, expect, it } from "vitest";
import {
  DASHSCOPE_INTERNATIONAL_BASE_URL,
  createTransport,
  resolveProvider,
} from "../../src/providers";

describe("resolveProvider", () => {
  it("keeps the ollama transport when a baseURL override is given", () => {
    const config = resolveProvider({ name: "ollama", baseURL: "http://example.test:11434" }, {});
    expect(config.kind).toBe("ollama");
    expect(config.name).toBe("ollama");
    expect(config.baseURL).toBe("http://example.test:11434");
  });

  it("routes an ollama baseURL override to the ollama API", async () => {
    const config = resolveProvider({ name: "ollama", baseURL: "http://example.test:11434/" }, {});
    const transport = createTransport(config);
    const seen: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      await transport.listLocalModels();
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(seen).toEqual(["http://example.test:11434/api/tags"]);
  });

  it("keeps dashscope request mapping when the base URL is overridden", () => {
    const config = resolveProvider({ name: "dashscope", baseURL: "https://proxy.example/v1" }, {});
    expect(config.name).toBe("dashscope");
    expect(config.baseURL).toBe("https://proxy.example/v1");
    expect(config.mapRequestBody).toBeTypeOf("function");
  });

  it("honours QWEN_BASE_URL as a fallback and as a custom endpoint", () => {
    const openai = resolveProvider(
      { name: "openai" },
      { QWEN_BASE_URL: "https://fallback.example/v1" },
    );
    expect(openai.baseURL).toBe("https://fallback.example/v1");

    const ollama = resolveProvider(
      { name: "ollama" },
      { QWEN_BASE_URL: "http://fallback.example:11434" },
    );
    expect(ollama.kind).toBe("ollama");
    expect(ollama.baseURL).toBe("http://fallback.example:11434");

    const custom = resolveProvider({}, { QWEN_BASE_URL: "https://only.example/v1" });
    expect(custom.kind).toBe("openai-compat");
    expect(custom.name).toBe("custom");
    expect(custom.baseURL).toBe("https://only.example/v1");
  });

  it("prefers provider-specific env over QWEN_BASE_URL", () => {
    const config = resolveProvider(
      { name: "ollama" },
      { OLLAMA_HOST: "http://local.example:11434", QWEN_BASE_URL: "http://other.example" },
    );
    expect(config.baseURL).toBe("http://local.example:11434");
  });

  it("selects ollama from QWEN_PROVIDER even with QWEN_BASE_URL set", () => {
    const config = resolveProvider(
      {},
      { QWEN_PROVIDER: "ollama", QWEN_BASE_URL: "http://host.example:11434" },
    );
    expect(config.kind).toBe("ollama");
    expect(config.baseURL).toBe("http://host.example:11434");
  });

  it("treats a bare URL provider as OpenAI-compatible", () => {
    const config = resolveProvider("https://api.example/v1", {});
    expect(config.kind).toBe("openai-compat");
    expect(config.name).toBe("custom");
    expect(config.baseURL).toBe("https://api.example/v1");
  });

  it("accepts a custom name alongside an explicit baseURL", () => {
    const config = resolveProvider({ name: "custom", baseURL: "http://example.test:8080/v1" }, {});
    expect(config.kind).toBe("openai-compat");
    expect(config.name).toBe("custom");
    expect(config.baseURL).toBe("http://example.test:8080/v1");
  });

  it("defaults to dashscope international", () => {
    const config = resolveProvider({}, {});
    expect(config.name).toBe("dashscope");
    expect(config.baseURL).toBe(DASHSCOPE_INTERNATIONAL_BASE_URL);
  });

  it("rejects unknown provider names", () => {
    expect(() => resolveProvider("not-a-provider", {})).toThrow(/Unknown provider/);
  });

  it("applies DASHSCOPE_HTTP_BASE_URL when no provider is selected", () => {
    const config = resolveProvider(
      {},
      {
        DASHSCOPE_HTTP_BASE_URL: "https://specific.example/v1",
        QWEN_BASE_URL: "https://fallback.example/v1",
      },
    );
    expect(config.name).toBe("dashscope");
    expect(config.baseURL).toBe("https://specific.example/v1");
  });

  it("adds a scheme to scheme-less provider hosts", () => {
    const ollama = resolveProvider({ name: "ollama" }, { OLLAMA_HOST: "localhost:11434" });
    expect(ollama.baseURL).toBe("http://localhost:11434");

    const custom = resolveProvider({ name: "custom", baseURL: "example.test:8080/v1" }, {});
    expect(custom.baseURL).toBe("http://example.test:8080/v1");
  });
});
