export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
}

export type ContentPart = TextPart | ImagePart;

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

export interface Message {
  role: MessageRole;
  content: string | ContentPart[] | null;
  name?: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

export type ToolChoice =
  | "none"
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
}

export type FinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "function_call"
  | null;

export interface ModelRefLike {
  id: string;
  ollamaTag?: string;
  dashscopeId?: string;
  openrouterId?: string;
}

export type ModelRef = string | ModelRefLike;

export function modelRefId(ref: ModelRef | undefined): string | undefined {
  if (ref === undefined) return undefined;
  return typeof ref === "string" ? ref : (ref.dashscopeId ?? ref.ollamaTag ?? ref.id);
}

export function modelRefOllama(ref: ModelRef | undefined): string | undefined {
  if (ref === undefined) return undefined;
  return typeof ref === "string" ? ref : (ref.ollamaTag ?? ref.id);
}

export interface ChatRequest {
  model?: ModelRef;
  messages: Message[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string | string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  logitBias?: Record<string, number>;
  user?: string;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  responseFormat?: {
    type: "text" | "json_object" | "json_schema";
    json_schema?: Record<string, unknown>;
  };
  thinking?: boolean;
  thinkingBudget?: number;
  enableSearch?: boolean;
}

export interface ChatResponse {
  id: string;
  model: string;
  message: Message;
  finishReason: FinishReason;
  usage?: Usage;
  raw: unknown;
}

export interface ChatChunk {
  id: string;
  model: string;
  delta: {
    content?: string;
    reasoningContent?: string;
    toolCalls?: ToolCallDelta[];
  };
  finishReason: FinishReason;
  usage?: Usage;
  raw?: unknown;
}

export interface EmbedRequest {
  model?: string;
  input: string | string[];
  dimensions?: number;
  user?: string;
  instruction?: string;
  textType?: "query" | "document";
}

export interface EmbedResponse {
  embeddings: number[][];
  dimensions: number;
  usage?: Usage;
  raw: unknown;
}

export interface LocalModel {
  tag: string;
  name: string;
  size?: number;
  parameterSize?: string;
  quantization?: string;
  modifiedAt?: string;
  raw?: unknown;
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}
