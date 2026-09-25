import { parseArgs } from "node:util";

export interface CliFlags {
  model?: string;
  provider?: string;
  system?: string;
  prompt?: string;
  thinking?: boolean;
  thinkingBudget?: number;
  enableSearch?: boolean;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  quiet?: boolean;
  local?: boolean;
  use?: "chat" | "coding" | "reasoning" | "translate" | "vision" | "embed";
  maxParams?: string;
  top?: number;
  help?: boolean;
  version?: boolean;
  positionals: string[];
}

const OPTIONS = {
  model: { type: "string", short: "m" },
  provider: { type: "string", short: "p" },
  system: { type: "string", short: "s" },
  prompt: { type: "string" },
  thinking: { type: "boolean" },
  "no-thinking": { type: "boolean" },
  "thinking-budget": { type: "string" },
  "enable-search": { type: "boolean" },
  temperature: { type: "string", short: "t" },
  "max-tokens": { type: "string" },
  json: { type: "boolean", short: "j" },
  quiet: { type: "boolean", short: "q" },
  local: { type: "boolean", short: "l" },
  use: { type: "string", short: "u" },
  "max-params": { type: "string" },
  top: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

function num(
  name: string,
  value: string | undefined,
  opts?: { integer?: boolean; min?: number },
): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`--${name} must be a number (got "${value}")`);
  }
  if (opts?.integer && !Number.isInteger(n)) {
    throw new Error(`--${name} must be an integer (got "${value}")`);
  }
  if (opts?.min !== undefined && n < opts.min) {
    throw new Error(`--${name} must be at least ${opts.min} (got "${value}")`);
  }
  return n;
}

function paramLimit(value: string): string {
  if (!/^(\d+(?:\.\d+)?)\s*b?$/i.test(value.trim())) {
    throw new Error(`--max-params must look like 32b (got "${value}")`);
  }
  return value;
}

export function parseCliArgs(argv: string[]): CliFlags {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS as never,
    allowPositionals: true,
    allowNegative: true,
  });

  const v = values as Record<string, string | boolean | undefined>;
  const thinking = typeof v.thinking === "boolean" ? v.thinking : undefined;
  const noThinking = v["no-thinking"] === true;
  const thinkingExplicit = thinking !== undefined || noThinking;

  const use = v.use as CliFlags["use"] | undefined;
  if (use && !["chat", "coding", "reasoning", "translate", "vision", "embed"].includes(use)) {
    throw new Error(
      `--use must be one of chat, coding, reasoning, translate, vision, embed (got "${use}")`,
    );
  }

  const flags: CliFlags = {
    positionals,
    help: v.help === true,
    version: v.version === true,
    json: v.json === true,
    quiet: v.quiet === true,
    local: v.local === true,
  };

  if (typeof v.model === "string") flags.model = v.model;
  if (typeof v.provider === "string") flags.provider = v.provider;
  if (typeof v.system === "string") flags.system = v.system;
  if (typeof v.prompt === "string") flags.prompt = v.prompt;
  if (thinkingExplicit) flags.thinking = noThinking ? false : thinking;
  const budget = num("thinking-budget", v["thinking-budget"] as string | undefined, {
    integer: true,
    min: 0,
  });
  if (budget !== undefined) flags.thinkingBudget = budget;
  if (v["enable-search"] === true) flags.enableSearch = true;
  const temperature = num("temperature", v.temperature as string | undefined);
  if (temperature !== undefined) flags.temperature = temperature;
  const maxTokens = num("max-tokens", v["max-tokens"] as string | undefined, {
    integer: true,
    min: 0,
  });
  if (maxTokens !== undefined) flags.maxTokens = maxTokens;
  if (typeof v.use === "string") flags.use = use;
  if (typeof v["max-params"] === "string") flags.maxParams = paramLimit(v["max-params"]);
  const top = num("top", v.top as string | undefined, { integer: true, min: 1 });
  if (top !== undefined) flags.top = top;

  return flags;
}

export function formatUnknown(flag: string): string {
  return `Unknown flag: ${flag}`;
}
