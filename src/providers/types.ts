import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  LocalModel,
  PullProgress,
} from "../types";

export type ProviderKind = "openai-compat" | "ollama";

export type ProviderName = "dashscope" | "dashscope-cn" | "openai" | "ollama";

export interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  kind: ProviderKind;
  mapRequestBody?: (body: Record<string, unknown>, req: ChatRequest) => void;
  mapEmbedBody?: (body: Record<string, unknown>, req: EmbedRequest) => void;
}

export interface ProviderOverrides {
  name?: string;
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  kind?: ProviderKind;
}

export type ProviderInput = ProviderName | ProviderOverrides | (string & {});

export interface CallOptions {
  signal?: AbortSignal;
}

export interface Transport {
  chat(req: ChatRequest, opts?: CallOptions): Promise<ChatResponse>;
  chatStream(req: ChatRequest, opts?: CallOptions): AsyncIterable<ChatChunk>;
  embed(req: EmbedRequest, opts?: CallOptions): Promise<EmbedResponse>;
  listLocalModels(opts?: CallOptions): Promise<LocalModel[]>;
  pullModel(
    tag: string,
    opts?: CallOptions & { onProgress?: (p: PullProgress) => void },
  ): Promise<void>;
}
