import { afterEach, describe, expect, it } from "vitest";
import type { CliFlags } from "../../src/cli/args";
import { runConfig } from "../../src/cli/commands/config";
import { runModels } from "../../src/cli/commands/models";
import { runRecommend } from "../../src/cli/commands/recommend";
import { main, resolveChatTarget } from "../../src/cli/index";
import { models, resolveModel } from "../../src/models";

function flags(partial: Partial<CliFlags> = {}): CliFlags {
  return { positionals: [], ...partial };
}

const ENV_KEYS = [
  "QWEN_PROVIDER",
  "QWEN_BASE_URL",
  "QWEN_API_KEY",
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_HTTP_BASE_URL",
  "OLLAMA_HOST",
] as const;

const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("cli entry point", () => {
  it("exposes main without executing the CLI on import", () => {
    expect(main).toBeTypeOf("function");
  });

  it("rejects an invalid task before running a command", async () => {
    await expect(main(["--use", "dancing"])).resolves.toBe(2);
  });
});

describe("resolveChatTarget", () => {
  it("defaults local chat to Ollama and honors maxParams", () => {
    const target = resolveChatTarget(flags({ local: true, use: "coding", maxParams: "32b" }));
    expect(target.provider).toBe("ollama");
    expect(target.model).toBe("qwen3-coder-30b");
  });

  it("preserves an explicit provider and model", () => {
    const target = resolveChatTarget(
      flags({ local: true, provider: "dashscope", model: "qwen3-coder:30b" }),
    );
    expect(target.provider).toBe("dashscope");
    expect(target.model).toBe("qwen3-coder:30b");
  });

  it("respects QWEN_PROVIDER=ollama and picks DashScope-mapped coding defaults", () => {
    setEnv({ QWEN_PROVIDER: "ollama" });
    const ollamaTarget = resolveChatTarget(flags());
    expect(resolveModel(ollamaTarget.model)?.ollamaTag).toBeTruthy();

    setEnv({ QWEN_PROVIDER: undefined });
    const codingTarget = resolveChatTarget(flags({ use: "coding" }));
    expect(codingTarget.model).toBe("qwen3-coder-30b");
    expect(resolveModel(codingTarget.model)?.dashscopeId).toBe("qwen3-coder-flash");

    const smallCodingTarget = resolveChatTarget(flags({ use: "coding", maxParams: "32b" }));
    expect(smallCodingTarget.model).toBe("qwen3-coder-30b");
    expect(resolveModel(smallCodingTarget.model)?.dashscopeId).toBe("qwen3-coder-flash");
  });
});

describe("offline cli commands", () => {
  it("lists the full catalog as JSON", async () => {
    const lines: string[] = [];
    const code = await runModels(flags({ json: true }), (line) => lines.push(line));
    const payload = JSON.parse(lines.join("\n")) as unknown[];
    expect(code).toBe(0);
    expect(payload).toHaveLength(models.length);
  });

  it("applies local and parameter constraints to recommendations", async () => {
    const lines: string[] = [];
    const code = await runRecommend(
      flags({ use: "coding", local: true, maxParams: "32b", top: 1, json: true }),
      (line) => lines.push(line),
    );
    const payload = JSON.parse(lines.join("\n")) as Array<{ id: string }>;
    expect(code).toBe(0);
    expect(payload.map((model) => model.id)).toEqual(["qwen3-coder-30b"]);
  });

  it("reports fallback API key sources accurately", async () => {
    setEnv({ QWEN_PROVIDER: "dashscope", QWEN_API_KEY: "qwen-fallback-key" });
    const lines: string[] = [];
    const code = await runConfig(flags({ json: true }), (line) => lines.push(line));
    const payload = JSON.parse(lines.join("\n")) as { apiKeySource: string };
    expect(code).toBe(0);
    expect(payload.apiKeySource).toBe("QWEN_API_KEY");
  });

  it("redacts credentials embedded in a base URL", async () => {
    setEnv({
      QWEN_BASE_URL: "https://user:secret@example.test/v1",
      QWEN_API_KEY: "example-key",
    });
    const lines: string[] = [];
    const code = await runConfig(flags({ json: true }), (line) => lines.push(line));
    const payload = JSON.parse(lines.join("\n")) as { baseURL: string };
    expect(code).toBe(0);
    expect(payload.baseURL).toBe("https://***@example.test/v1");
  });

  it("honors -l/--local in config", async () => {
    const lines: string[] = [];
    const code = await runConfig(flags({ local: true, json: true }), (line) => lines.push(line));
    const payload = JSON.parse(lines.join("\n")) as {
      provider: string;
      kind: string;
      apiKeySource: string;
    };
    expect(code).toBe(0);
    expect(payload.provider).toBe("ollama");
    expect(payload.kind).toBe("ollama");
    expect(payload.apiKeySource).toBe("none required");
  });

  it("prints a valid hint when no model matches", async () => {
    const lines: string[] = [];
    const code = await runRecommend(flags({ local: true, maxParams: "0.1" }), (line) =>
      lines.push(line),
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).not.toContain("--local=false");
    expect(lines.join("\n")).toContain("omitting --local");
  });
});
