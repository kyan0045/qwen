import { ConfigurationError } from "../errors";
import {
  DASHSCOPE_CHINA_BASE_URL,
  DASHSCOPE_INTERNATIONAL_BASE_URL,
  createDashScopeTransport,
  dashscopeProviderConfig,
} from "./dashscope";
import { createOllamaTransport } from "./ollama";
import { createOpenAICompatTransport } from "./openai-compat";
import type { ProviderConfig, ProviderInput, Transport } from "./types";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

export {
  DASHSCOPE_CHINA_BASE_URL,
  DASHSCOPE_INTERNATIONAL_BASE_URL,
} from "./dashscope";

export type {
  ProviderConfig,
  ProviderInput,
  ProviderKind,
  ProviderName,
  Transport,
  CallOptions,
} from "./types";

export interface ResolveEnv {
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_HTTP_BASE_URL?: string;
  OLLAMA_HOST?: string;
  QWEN_PROVIDER?: string;
  QWEN_API_KEY?: string;
  QWEN_BASE_URL?: string;
}

function env(): ResolveEnv {
  return process.env as ResolveEnv;
}

function pickKey(...candidates: Array<string | undefined>): string | undefined {
  for (const c of candidates) {
    if (c) return c;
  }
  return undefined;
}

export function isOpenRouterEndpoint(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
  } catch {
    return baseURL.toLowerCase().includes("openrouter.ai");
  }
}

function normalizeBaseURL(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ConfigurationError("Provider baseURL must not be empty.");
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function withDefaults(
  config: ProviderConfig,
  overrides: {
    name?: string;
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    kind?: ProviderConfig["kind"];
  },
  environment: ResolveEnv,
): ProviderConfig {
  const out: ProviderConfig = { ...config };
  if (overrides.baseURL) out.baseURL = overrides.baseURL;
  else if (environment.QWEN_BASE_URL && !config.baseURL) out.baseURL = environment.QWEN_BASE_URL;
  if (overrides.apiKey) out.apiKey = overrides.apiKey;
  else if (out.apiKey === undefined) out.apiKey = environment.QWEN_API_KEY;
  if (overrides.headers) out.headers = overrides.headers;
  if (overrides.kind) out.kind = overrides.kind;
  out.baseURL = normalizeBaseURL(out.baseURL.replace(/\/+$/, ""));
  return out;
}

function dashscopeBase(
  overrides: { baseURL?: string },
  environment: ResolveEnv,
  fallback: string,
): string {
  return (
    overrides.baseURL ??
    environment.DASHSCOPE_HTTP_BASE_URL ??
    environment.QWEN_BASE_URL ??
    fallback
  );
}

export function resolveProvider(
  input?: ProviderInput,
  environment: ResolveEnv = env(),
): ProviderConfig {
  const overrides = typeof input === "string" ? { name: input } : (input ?? {});
  const wanted = overrides.name ?? environment.QWEN_PROVIDER;

  if (!wanted) {
    if (environment.DASHSCOPE_HTTP_BASE_URL && !overrides.baseURL) {
      const config = dashscopeProviderConfig(
        true,
        pickKey(overrides.apiKey, environment.DASHSCOPE_API_KEY, environment.QWEN_API_KEY),
      );
      config.baseURL = environment.DASHSCOPE_HTTP_BASE_URL;
      if (overrides.headers) config.headers = overrides.headers;
      return withDefaults(config, overrides, environment);
    }
    const customURL = overrides.baseURL ?? environment.QWEN_BASE_URL;
    if (customURL) {
      return withDefaults(
        {
          name: "custom",
          baseURL: customURL,
          apiKey: pickKey(overrides.apiKey, environment.QWEN_API_KEY),
          headers: overrides.headers,
          kind: overrides.kind ?? "openai-compat",
        },
        overrides,
        environment,
      );
    }
    const config = dashscopeProviderConfig(
      true,
      pickKey(overrides.apiKey, environment.DASHSCOPE_API_KEY, environment.QWEN_API_KEY),
    );
    config.baseURL =
      overrides.baseURL ??
      environment.DASHSCOPE_HTTP_BASE_URL ??
      environment.QWEN_BASE_URL ??
      config.baseURL;
    if (overrides.headers) config.headers = overrides.headers;
    return withDefaults(config, overrides, environment);
  }

  switch (wanted) {
    case "dashscope":
    case "model-studio":
    case "bailian": {
      const config = dashscopeProviderConfig(
        true,
        pickKey(overrides.apiKey, environment.DASHSCOPE_API_KEY, environment.QWEN_API_KEY),
      );
      config.baseURL = dashscopeBase(overrides, environment, config.baseURL);
      if (overrides.headers) config.headers = overrides.headers;
      return withDefaults(config, overrides, environment);
    }
    case "dashscope-cn":
    case "model-studio-cn":
    case "bailian-cn": {
      const config = dashscopeProviderConfig(
        false,
        pickKey(overrides.apiKey, environment.DASHSCOPE_API_KEY, environment.QWEN_API_KEY),
      );
      config.baseURL = dashscopeBase(overrides, environment, config.baseURL);
      if (overrides.headers) config.headers = overrides.headers;
      return withDefaults(config, overrides, environment);
    }
    case "openai": {
      const baseURL = overrides.baseURL ?? environment.QWEN_BASE_URL;
      if (!baseURL) {
        throw new ConfigurationError(
          'Provider "openai" needs an explicit endpoint. Set QWEN_BASE_URL or pass baseURL.',
        );
      }
      return withDefaults(
        {
          name: "openai",
          baseURL,
          apiKey: pickKey(overrides.apiKey, environment.QWEN_API_KEY),
          headers: overrides.headers,
          kind: "openai-compat",
        },
        overrides,
        environment,
      );
    }
    case "ollama": {
      return withDefaults(
        {
          name: "ollama",
          baseURL:
            overrides.baseURL ??
            environment.OLLAMA_HOST ??
            environment.QWEN_BASE_URL ??
            DEFAULT_OLLAMA_BASE_URL,
          apiKey: pickKey(overrides.apiKey, environment.QWEN_API_KEY),
          headers: overrides.headers,
          kind: "ollama",
        },
        overrides,
        environment,
      );
    }
    default: {
      const isURL = /^https?:\/\//.test(wanted);
      const baseURL = overrides.baseURL ?? (isURL ? wanted : environment.QWEN_BASE_URL);
      if (!baseURL) {
        throw new ConfigurationError(
          `Unknown provider "${wanted}". Use "dashscope", "dashscope-cn", "openai", "ollama", or a full baseURL.`,
        );
      }
      return withDefaults(
        {
          name: isURL ? "custom" : wanted,
          baseURL,
          apiKey: pickKey(overrides.apiKey, environment.QWEN_API_KEY),
          headers: overrides.headers,
          kind: overrides.kind ?? "openai-compat",
        },
        { ...overrides, baseURL },
        environment,
      );
    }
  }
}

export function createTransport(config: ProviderConfig): Transport {
  if (config.kind === "ollama") {
    return createOllamaTransport({
      name: config.name,
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      headers: config.headers,
    });
  }
  if (config.name.startsWith("dashscope")) {
    return createDashScopeTransport(config);
  }
  return createOpenAICompatTransport({
    name: config.name,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    headers: config.headers,
    mapRequestBody: config.mapRequestBody,
    mapEmbedBody: config.mapEmbedBody,
  });
}

export function defaultModelFor(config: ProviderConfig): string | undefined {
  if (config.kind === "ollama") return "qwen3.8:27b";
  if (isOpenRouterEndpoint(config.baseURL)) return "qwen/qwen3-coder-plus";
  if (config.name.startsWith("dashscope")) return "qwen3-coder-plus";
  return "qwen3-coder-plus";
}
