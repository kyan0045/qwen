import { type ProviderConfig, resolveProvider } from "../../providers";
import type { CliFlags } from "../args";

function mask(value: string | undefined): string {
  if (!value) return "(none)";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}

function source(config: ProviderConfig): string {
  const env = process.env;
  const firstSet = (...names: string[]): string => {
    for (const name of names) {
      if (env[name]) return name;
    }
    return "(unset)";
  };
  if (config.name.startsWith("dashscope")) {
    return firstSet("DASHSCOPE_API_KEY", "QWEN_API_KEY");
  }
  if (config.name === "openai") return firstSet("OPENAI_API_KEY", "QWEN_API_KEY");
  if (config.name === "ollama") {
    return env.QWEN_API_KEY ? "QWEN_API_KEY" : "none required";
  }
  return firstSet("QWEN_API_KEY", "OPENAI_API_KEY");
}

function redactBaseURL(value: string): string {
  const match = /^(https?:\/\/)([^@/]*@)(.*)$/.exec(value);
  const scheme = match?.[1];
  const rest = match?.[3];
  if (!scheme || !rest) return value;
  return `${scheme}***@${rest}`;
}

export async function runConfig(flags: CliFlags, out: (s: string) => void): Promise<number> {
  const config = resolveProvider(flags.provider as never);
  const payload = {
    provider: config.name,
    kind: config.kind,
    baseURL: redactBaseURL(config.baseURL),
    apiKey: mask(config.apiKey),
    apiKeySource: source(config),
  };
  if (flags.json) {
    out(JSON.stringify(payload, null, 2));
    return 0;
  }
  out(`provider     ${payload.provider}`);
  out(`kind         ${payload.kind}`);
  out(`baseURL      ${payload.baseURL}`);
  out(`apiKey       ${payload.apiKey}  (from ${payload.apiKeySource})`);
  return 0;
}
