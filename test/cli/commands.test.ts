import { afterEach, describe, expect, it } from "vitest";
import type { CliFlags } from "../../src/cli/args";
import { runConfig } from "../../src/cli/commands/config";
import { runModels } from "../../src/cli/commands/models";
import { runRecommend } from "../../src/cli/commands/recommend";
import { main, resolveChatTarget } from "../../src/cli/index";
import { models } from "../../src/models";

function flags(partial: Partial<CliFlags> = {}): CliFlags {
  return { positionals: [], ...partial };
}

const ENV_KEYS = [
  "QWEN_PROVIDER",
  "QWEN_BASE_URL",
  "QWEN_API_KEY",
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_HTTP_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
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
});
