import { ConfigurationError } from "./errors";
import { QWEN3_EMBEDDING_8B, type QwenModel, requireModel, resolveModel } from "./models";
import {
  type ProviderConfig,
  type ProviderInput,
  type Transport,
  createTransport,
  defaultModelFor,
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
  provider?: ProviderInput;
  apiKey?: string;
  baseURL?: string;
  model?: ModelRef;
  defaultThinking?: boolean;
  headers?: Record<string, string>;
  env?: Record<string, string | undefined>;
}

export interface CallOptions {
  signal?: AbortSignal;
}

export function resolveModelName(
  ref: ModelRef | undefined,
  config: Pick<ProviderConfig, "kind" | "name">,
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
  const supplied = typeof ref === "string" ? ref : ref.id;
  const known = typeof ref === "string" ? resolveModel(ref) : ref;
  if (!known) return supplied;
  if (config.kind === "ollama") return known.ollamaTag ?? supplied;
  if (config.name.startsWith("dashscope")) return known.dashscopeId ?? supplied;
  return supplied;
}

export class Qwen {
  readonly config: ProviderConfig;
  readonly transport: Transport;
  private readonly defaultModel?: ModelRef;
  private readonly defaultThinking?: boolean;

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
  }

  model(ref?: ModelRef): QwenModel | undefined {
    return resolveModel(modelRefId(ref ?? this.defaultModel) ?? "");
  }

  private pickModel(ref?: ModelRef): string {
    return resolveModelName(ref ?? this.defaultModel, this.config, defaultModelFor(this.config));
  }

  private prepare(req: ChatRequest): ChatRequest {
    const prepared: ChatRequest = { ...req, model: this.pickModel(req.model) };
    if (prepared.thinking === undefined && this.defaultThinking !== undefined) {
      prepared.thinking = this.defaultThinking;
    }
    return prepared;
  }

  chat(req: ChatRequest, opts?: CallOptions): Promise<ChatResponse> {
    return this.transport.chat(this.prepare(req), opts);
  }

  chatStream(req: ChatRequest, opts?: CallOptions): AsyncIterable<ChatChunk> {
    return this.transport.chatStream(this.prepare(req), opts);
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
    const model = resolveModelName(req.model ?? this.defaultModel ?? fallback, this.config);
    return this.transport.embed({ ...req, model }, opts);
  }

  listLocalModels(opts?: CallOptions): Promise<LocalModel[]> {
    return this.transport.listLocalModels(opts);
  }

  pullModel(
    tag: string,
    opts?: CallOptions & { onProgress?: (p: PullProgress) => void },
  ): Promise<void> {
    return this.transport.pullModel(tag, opts);
  }

  messages(role: Message["role"], content: Message["content"]): Message {
    return { role, content };
  }
}

export function createClient(options?: QwenOptions): Qwen {
  return new Qwen(options);
}

export function chat(
  req: ChatRequest & { provider?: ProviderInput } & QwenOptions,
): Promise<ChatResponse> {
  const { provider, apiKey, baseURL, model, defaultThinking, headers, env, ...rest } = req;
  const client = new Qwen({ provider, apiKey, baseURL, model, defaultThinking, headers, env });
  return client.chat(rest);
}

export function chatStream(
  req: ChatRequest & { provider?: ProviderInput } & QwenOptions,
): AsyncIterable<ChatChunk> {
  const { provider, apiKey, baseURL, model, defaultThinking, headers, env, ...rest } = req;
  const client = new Qwen({ provider, apiKey, baseURL, model, defaultThinking, headers, env });
  return client.chatStream(rest);
}

export async function say(
  prompt: string,
  req: Omit<ChatRequest, "messages"> & QwenOptions = {},
): Promise<string> {
  const { provider, apiKey, baseURL, model, defaultThinking, headers, env, ...rest } = req;
  const client = new Qwen({ provider, apiKey, baseURL, model, defaultThinking, headers, env });
  return client.say(prompt, rest);
}

export { requireModel, resolveModel };
