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

function parseEndpointHostname(baseURL: string | undefined): string | undefined {
  if (!baseURL) return undefined;
  const trimmed = baseURL.trim();
  if (!trimmed) return undefined;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isOpenRouterEndpoint(baseURL: string | undefined): boolean {
  const host = parseEndpointHostname(baseURL);
  if (!host) return false;
  return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
}

/**
 * Recognises Model Studio / DashScope and QwenCloud hosts, including regional
 * hosts such as dashscope-us and workspace-dedicated maas domains. These need
 * the DashScope request mapping even when no provider name was given.
 */
export function isDashScopeEndpoint(baseURL: string | undefined): boolean {
  const host = parseEndpointHostname(baseURL);
  if (!host) return false;
  return (
    /(^|\.)dashscope(?:-[a-z0-9-]+)?\.aliyuncs\.com$/.test(host) ||
    host === "maas.aliyuncs.com" ||
    host.endsWith(".maas.aliyuncs.com") ||
    host === "maas.qwencloudapi.com" ||
    host.endsWith(".maas.qwencloudapi.com")
  );
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "127.0.0.1" || host === "::1") return true;
  if (host === "host.docker.internal" || host.endsWith(".docker.internal")) return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const m172 = /^172\.(1[6-9]|2\d|3[01])\./.exec(host);
  if (m172) return true;
  return false;
}

function normalizeBaseURL(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ConfigurationError("Provider baseURL must not be empty.");
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)(.*)$/.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!;
    const rest = schemeMatch[2]!.replace(/\/+$/, "");
    if (!rest) {
      throw new ConfigurationError("Provider baseURL must not be empty.");
    }
    return `${scheme}${rest}`;
  }
  const cleaned = trimmed.replace(/\/+$/, "");
  if (!cleaned) {
    throw new ConfigurationError("Provider baseURL must not be empty.");
  }
  const authority = cleaned.split("/")[0] ?? "";
  const hostPort = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;
  const hostname = hostPort.startsWith("[")
    ? (hostPort.slice(1).split("]")[0] ?? "")
    : (hostPort.split(":")[0] ?? "");
  if (isLocalHostname(hostname)) return `http://${cleaned}`;
  return `https://${cleaned}`;
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
  if (overrides.baseURL !== undefined) out.baseURL = overrides.baseURL;
  else if (environment.QWEN_BASE_URL && !config.baseURL) out.baseURL = environment.QWEN_BASE_URL;
  if (overrides.apiKey) out.apiKey = overrides.apiKey;
  else if (out.apiKey === undefined) out.apiKey = environment.QWEN_API_KEY;
  if (overrides.headers) out.headers = overrides.headers;
  if (overrides.kind) out.kind = overrides.kind;
  out.baseURL = normalizeBaseURL(out.baseURL);
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
    if (environment.DASHSCOPE_HTTP_BASE_URL && overrides.baseURL === undefined) {
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
      if (isDashScopeEndpoint(customURL)) {
        const config = dashscopeProviderConfig(
          true,
          pickKey(overrides.apiKey, environment.DASHSCOPE_API_KEY, environment.QWEN_API_KEY),
        );
        config.baseURL = customURL;
        if (overrides.headers) config.headers = overrides.headers;
        return withDefaults(config, overrides, environment);
      }
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

  switch (wanted.toLowerCase()) {
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
      const isURL = /^https?:\/\//i.test(wanted);
      const baseURL =
        overrides.baseURL ??
        (isURL
          ? wanted
          : wanted.toLowerCase() === "custom"
            ? environment.QWEN_BASE_URL
            : undefined);
      if (!baseURL) {
        throw new ConfigurationError(
          `Unknown provider "${wanted}". Use "dashscope", "dashscope-cn", "openai", "ollama", or a full baseURL.`,
        );
      }
      if (overrides.kind !== "ollama" && isDashScopeEndpoint(baseURL)) {
        const config = dashscopeProviderConfig(
          true,
          pickKey(overrides.apiKey, environment.DASHSCOPE_API_KEY, environment.QWEN_API_KEY),
        );
        config.baseURL = baseURL;
        if (overrides.headers) config.headers = overrides.headers;
        return withDefaults(config, { ...overrides, baseURL }, environment);
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
  if (config.name.toLowerCase().startsWith("dashscope") || isDashScopeEndpoint(config.baseURL)) {
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
  if (isOpenRouterEndpoint(config.baseURL)) return "qwen/qwen3.8-flash";
  return "qwen3.8-flash";
}
