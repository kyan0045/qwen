import { ConfigurationError } from "./errors";
import {
  QWEN3_EMBEDDING_8B,
  type QwenModel,
  modelsById,
  requireModel,
  resolveModel,
} from "./models";
import {
  type CallOptions,
  type ProviderConfig,
  type ProviderInput,
  type Transport,
  createTransport,
  defaultModelFor,
  isOpenRouterEndpoint,
  resolveProvider,
} from "./providers";
import { type ModelRef, modelRefId } from "./types";
import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  LocalModel,
  Message,
  PullProgress,
} from "./types";

export interface QwenOptions {
  /** Provider name, URL, or overrides. Falls back to `QWEN_PROVIDER`, then DashScope. */
  provider?: ProviderInput;
  /** Explicit key. Wins over `DASHSCOPE_API_KEY` / `QWEN_API_KEY`. */
  apiKey?: string;
  /** Endpoint override. Falls back to `QWEN_BASE_URL` / provider hosts. */
  baseURL?: string;
  model?: ModelRef;
  defaultThinking?: boolean;
  headers?: Record<string, string>;
  /** Defaults to `process.env`. Inject a record in tests. */
  env?: Record<string, string | undefined>;
  /**
   * Default per-request timeout in milliseconds. Overridden per call by
   * `CallOptions.timeoutMs`.
   */
  timeoutMs?: number;
}

export type { CallOptions } from "./providers";

function isQwenModelShape(value: ModelRef): value is QwenModel {
  if (typeof value === "string") return false;
  const m = value as Partial<QwenModel>;
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    typeof m.contextWindow === "number" &&
    Array.isArray(m.capabilities)
  );
}

export function resolveModelName(
  ref: ModelRef | undefined,
  config: Pick<ProviderConfig, "kind" | "name"> & { baseURL?: string },
  fallback?: string,
): string {
  if (ref === undefined) {
    if (!fallback) {
      throw new ConfigurationError(
        "No model specified. Pass `model` to the client or to the call (see `recommend()`).",
      );
    }
    return fallback;
  }
  if (typeof ref === "string" && !ref.trim()) {
    throw new ConfigurationError("Model id must not be empty.");
  }
  if (typeof ref !== "string" && (typeof ref.id !== "string" || !ref.id.trim())) {
    throw new ConfigurationError("Model id must not be empty.");
  }
  const supplied = typeof ref === "string" ? ref : ref.id;
  const known =
    typeof ref === "string" ? resolveModel(ref) : (modelsById.get(ref.id) ?? resolveModel(ref.id));
  if (!known) return supplied;
  if (config.kind === "ollama") {
    if (!known.ollamaTag) {
      throw new ConfigurationError(
        `Model "${supplied}" has no Ollama tag and cannot be used with the Ollama provider.`,
      );
    }
    return known.ollamaTag;
  }
  if (isOpenRouterEndpoint(config.baseURL)) {
    if (!known.openrouterId) {
      throw new ConfigurationError(
        `Model "${supplied}" has no OpenRouter id and cannot be used on this endpoint.`,
      );
    }
    return known.openrouterId;
  }
  if (
    config.name.toLowerCase().startsWith("dashscope") ||
    (config.baseURL?.toLowerCase().includes("dashscope.aliyuncs.com") ?? false)
  ) {
    if (!known.dashscopeId) {
      throw new ConfigurationError(
        `Model "${supplied}" has no DashScope id and cannot be used with the DashScope provider.`,
      );
    }
    return known.dashscopeId;
  }
  return known.id ?? supplied;
}

export class Qwen {
  readonly config: ProviderConfig;
  readonly transport: Transport;
  private readonly defaultModel?: ModelRef;
  private readonly defaultThinking?: boolean;
  private readonly timeoutMs?: number;

  constructor(options: QwenOptions = {}) {
    const overrides: Record<string, unknown> = {};
    if (options.provider)
      Object.assign(overrides, typeof options.provider === "string" ? {} : options.provider);
    if (options.apiKey) overrides.apiKey = options.apiKey;
    if (options.baseURL) overrides.baseURL = options.baseURL;
    if (options.headers) overrides.headers = options.headers;
    const name = typeof options.provider === "string" ? options.provider : undefined;
    this.config = resolveProvider(
      { ...(overrides as object), ...(name ? { name } : {}) } as ProviderInput,
      (options.env ?? process.env) as Record<string, string | undefined>,
    );
    this.transport = createTransport(this.config);
    this.defaultModel = options.model;
    this.defaultThinking = options.defaultThinking;
    this.timeoutMs = options.timeoutMs;
  }

  model(ref?: ModelRef): QwenModel | undefined {
    const target = ref ?? this.defaultModel;
    if (target === undefined) return undefined;
    if (typeof target === "string") return resolveModel(modelRefId(target) ?? "");
    const catalogHit = modelsById.get(target.id) ?? resolveModel(target.id);
    if (catalogHit) return catalogHit;
    return isQwenModelShape(target) ? target : undefined;
  }

  private pickModel(ref?: ModelRef): string {
    const target = ref ?? this.defaultModel;
    try {
      return resolveModelName(target, this.config, defaultModelFor(this.config));
    } catch (error) {
      if (error instanceof ConfigurationError && target !== undefined) {
        const known =
          typeof target === "string"
            ? resolveModel(target)
            : (modelsById.get(target.id) ?? resolveModel(target.id));
        const fallback = known ? defaultModelFor(this.config) : undefined;
        if (fallback) return fallback;
      }
      throw error;
    }
  }

  private prepare(req: ChatRequest): ChatRequest {
    const prepared: ChatRequest = { ...req, model: this.pickModel(req.model) };
    if (prepared.thinking === undefined && this.defaultThinking !== undefined) {
      prepared.thinking = this.defaultThinking;
    }
    return prepared;
  }

  private withTimeout(opts?: CallOptions): CallOptions | undefined {
    if (opts?.timeoutMs !== undefined) return opts;
    if (this.timeoutMs === undefined) return opts;
    return { ...opts, timeoutMs: this.timeoutMs };
  }

  chat(req: ChatRequest, opts?: CallOptions): Promise<ChatResponse> {
    return this.transport.chat(this.prepare(req), this.withTimeout(opts));
  }

  chatStream(req: ChatRequest, opts?: CallOptions): AsyncIterable<ChatChunk> {
    return this.transport.chatStream(this.prepare(req), this.withTimeout(opts));
  }

  async say(
    prompt: string,
    req: Omit<ChatRequest, "messages"> = {},
    opts?: CallOptions,
  ): Promise<string> {
    const response = await this.chat(
      { ...req, messages: [{ role: "user", content: prompt }] },
      opts,
    );
    const content = response.message.content;
    if (typeof content === "string") return content;
    if (content === null) return "";
    return JSON.stringify(content);
  }

  async sayStream(
    prompt: string,
    req: Omit<ChatRequest, "messages"> = {},
    opts?: CallOptions,
  ): Promise<string> {
    let out = "";
    for await (const chunk of this.chatStream(
      { ...req, messages: [{ role: "user", content: prompt }] },
      opts,
    )) {
      if (chunk.delta.content) out += chunk.delta.content;
    }
    return out;
  }

  embed(req: EmbedRequest, opts?: CallOptions): Promise<EmbedResponse> {
    const fallback = this.config.kind === "ollama" ? "qwen3-embedding:8b" : QWEN3_EMBEDDING_8B;
    const requested = req.model ?? this.defaultModel;
    let model: string;
    if (requested === undefined) {
      model = resolveModelName(fallback, this.config);
    } else {
      const known =
        typeof requested === "string"
          ? resolveModel(requested)
          : (modelsById.get(requested.id) ?? resolveModel(requested.id));
      if (known && !known.capabilities.includes("embed")) {
        if (req.model !== undefined) {
          const label =
            typeof requested === "string" ? requested : (modelRefId(requested) ?? requested.id);
          throw new ConfigurationError(
            `Model "${label}" does not support embeddings. Pass an embedding model or omit model to use the default.`,
          );
        }
        model = resolveModelName(fallback, this.config);
      } else {
        model = resolveModelName(requested, this.config);
      }
    }
    return this.transport.embed({ ...req, model }, this.withTimeout(opts));
  }

  listLocalModels(opts?: CallOptions): Promise<LocalModel[]> {
    return this.transport.listLocalModels(this.withTimeout(opts));
  }

  pullModel(
    tag: string,
    opts?: CallOptions & { onProgress?: (p: PullProgress) => void },
  ): Promise<void> {
    return this.transport.pullModel(tag, this.withTimeout(opts));
  }

  messages(role: Message["role"], content: Message["content"]): Message {
    return { role, content };
  }
}

export function createClient(options?: QwenOptions): Qwen {
  return new Qwen(options);
}

type ClientOptions = QwenOptions & CallOptions & { provider?: ProviderInput };

function splitClientOptions(
  req: ChatRequest & Partial<ClientOptions>,
  opts?: ClientOptions,
): { client: Qwen; rest: ChatRequest; call?: CallOptions } {
  const merged = { ...req, ...opts };
  const {
    provider,
    apiKey,
    baseURL,
    model,
    defaultThinking,
    headers,
    env,
    timeoutMs,
    signal,
    ...rest
  } = merged;
  const client = new Qwen({
    provider,
    apiKey,
    baseURL,
    model,
    defaultThinking,
    headers,
    env,
    timeoutMs,
  });
  const call = signal !== undefined || timeoutMs !== undefined ? { signal, timeoutMs } : undefined;
  return { client, rest: rest as ChatRequest, call };
}

export function chat(
  req: ChatRequest & { provider?: ProviderInput } & QwenOptions,
  opts?: ClientOptions,
): Promise<ChatResponse> {
  const { client, rest, call } = splitClientOptions(req, opts);
  return client.chat(rest, call);
}

export function chatStream(
  req: ChatRequest & { provider?: ProviderInput } & QwenOptions,
  opts?: ClientOptions,
): AsyncIterable<ChatChunk> {
  const { client, rest, call } = splitClientOptions(req, opts);
  return client.chatStream(rest, call);
}

export async function say(
  prompt: string,
  req: Omit<ChatRequest, "messages"> & QwenOptions = {},
  opts?: ClientOptions,
): Promise<string> {
  const { client, rest, call } = splitClientOptions(
    req as ChatRequest & Partial<ClientOptions>,
    opts,
  );
  return client.say(prompt, rest, call);
}

export async function sayStream(
  prompt: string,
  req: Omit<ChatRequest, "messages"> & QwenOptions = {},
  opts?: ClientOptions,
): Promise<string> {
  const { client, rest, call } = splitClientOptions(
    req as ChatRequest & Partial<ClientOptions>,
    opts,
  );
  return client.sayStream(prompt, rest, call);
}

export function embed(
  req: EmbedRequest & { provider?: ProviderInput } & QwenOptions,
  opts?: ClientOptions,
): Promise<EmbedResponse> {
  const merged = { ...req, ...opts };
  const {
    provider,
    apiKey,
    baseURL,
    model,
    defaultThinking,
    headers,
    env,
    timeoutMs,
    signal,
    ...rest
  } = merged;
  const client = new Qwen({
    provider,
    apiKey,
    baseURL,
    model,
    defaultThinking,
    headers,
    env,
    timeoutMs,
  });
  const call = signal !== undefined || timeoutMs !== undefined ? { signal, timeoutMs } : undefined;
  return client.embed({ ...rest, model } as EmbedRequest, call);
}

export { requireModel, resolveModel };
