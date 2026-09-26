export {
  Qwen,
  createClient,
  chat,
  chatStream,
  say,
  type QwenOptions,
  type CallOptions,
} from "./client";

export {
  AuthenticationError,
  APIError,
  BadRequestError,
  ConfigurationError,
  ConnectionError,
  NotFoundError,
  PermissionError,
  QwenError,
  RateLimitError,
} from "./errors";

export {
  getModel,
  models,
  modelsById,
  recommend,
  recommendAll,
  requireModel,
  resolveModel,
  type RecommendOptions,
} from "./models";

export * from "./models/catalog";

export {
  DEFAULT_OLLAMA_BASE_URL,
  DASHSCOPE_CHINA_BASE_URL,
  DASHSCOPE_INTERNATIONAL_BASE_URL,
  createTransport,
  defaultModelFor,
  isOpenRouterEndpoint,
  resolveProvider,
  type ProviderConfig,
  type ProviderInput,
  type ProviderKind,
  type ProviderName,
  type Transport,
} from "./providers";

export type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ContentPart,
  EmbedRequest,
  EmbedResponse,
  FinishReason,
  ImagePart,
  LocalModel,
  Message,
  MessageRole,
  PullProgress,
  TextPart,
  Tool,
  ToolCall,
  ToolCallDelta,
  ToolChoice,
  Usage,
} from "./types";

export const VERSION = "0.1.0";
