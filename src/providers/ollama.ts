import { APIError, ConfigurationError } from "../errors";
import { modelRefOllama } from "../types";
import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ContentPart,
  EmbedRequest,
  EmbedResponse,
  FinishReason,
  LocalModel,
  Message,
  PullProgress,
  ToolCall,
  Usage,
} from "../types";
import { effectiveSignal, isAbortError, ndjsonLines, rawRequest, requestJSON } from "./http";
import type { CallOptions, Transport } from "./types";

interface OllamaToolCall {
  id?: string;
  function?: { name?: string; arguments?: unknown };
}

interface OllamaMessage {
  role?: string;
  content?: string;
  thinking?: string;
  reasoning_content?: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatPayload {
  model?: string;
  created_at?: string;
  message?: OllamaMessage;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

function contentToString(content: Message["content"]): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  return content
    .map((part: ContentPart) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function ollamaImageData(url: string): string {
  const dataUrl = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(url);
  const encoded = dataUrl?.[1];
  if (encoded) return encoded;
  if (url.length > 0 && url.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(url)) {
    return url;
  }
  throw new ConfigurationError(
    "Ollama image_url values must be base64-encoded image data or image data URLs. Remote image URLs are not accepted by the Ollama REST API.",
  );
}

function imageParts(content: Message["content"]): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((p): p is Extract<ContentPart, { type: "image_url" }> => p.type === "image_url")
    .map((p) => ollamaImageData(p.image_url.url));
}

function argsToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toOllamaMessage(m: Message): Record<string, unknown> {
  const out: Record<string, unknown> = {
    role: m.role,
    content: contentToString(m.content),
  };
  const images = imageParts(m.content);
  if (images.length) out.images = images;
  if (m.toolCallId) out.tool_call_id = m.toolCallId;
  if (m.reasoningContent) out.thinking = m.reasoningContent;
  if (m.toolCalls?.length) {
    out.tool_calls = m.toolCalls.map((t: ToolCall) => ({
      id: t.id,
      function: {
        name: t.function.name,
        arguments: tryParse(t.function.arguments),
      },
    }));
  }
  return out;
}

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function buildBody(req: ChatRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: modelRefOllama(req.model),
    messages: req.messages.map(toOllamaMessage),
    stream,
  };
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));
  }
  const options: Record<string, unknown> = {};
  if (req.temperature !== undefined) options.temperature = req.temperature;
  if (req.topP !== undefined) options.top_p = req.topP;
  if (req.maxTokens !== undefined) options.num_predict = req.maxTokens;
  if (req.stop !== undefined) options.stop = req.stop;
  if (req.seed !== undefined) options.seed = req.seed;
  if (req.presencePenalty !== undefined) options.presence_penalty = req.presencePenalty;
  if (req.frequencyPenalty !== undefined) options.frequency_penalty = req.frequencyPenalty;
  if (Object.keys(options).length) body.options = options;

  if (req.thinking !== undefined) body.think = req.thinking;
  else if (req.thinkingBudget !== undefined) body.think = true;

  return body;
}

function parseFinishReason(raw: unknown): FinishReason {
  if (raw === undefined || raw === null) return "stop";
  const value = String(raw);
  if (value === "length") return "length";
  if (value === "tool_calls") return "tool_calls";
  if (value === "stop") return "stop";
  return null;
}

function toToolCalls(raw: OllamaToolCall[] | undefined): ToolCall[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map((t, index) => ({
    id: t.id ?? `call_${index}`,
    type: "function" as const,
    function: {
      name: t.function?.name ?? "",
      arguments: argsToString(t.function?.arguments),
    },
  }));
}

function usageFromPayload(p: OllamaChatPayload): Usage | undefined {
  const prompt = p.prompt_eval_count;
  const completion = p.eval_count;
  if (prompt === undefined && completion === undefined) return undefined;
  const promptTokens = Number(prompt ?? 0);
  const completionTokens = Number(completion ?? 0);
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return undefined;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function messageFromPayload(m: OllamaMessage | undefined): Message {
  const message: Message = {
    role: "assistant",
    content: m?.content ?? "",
  };
  const reasoning = m?.thinking ?? m?.reasoning_content;
  if (reasoning) message.reasoningContent = reasoning;
  const toolCalls = toToolCalls(m?.tool_calls);
  if (toolCalls) message.toolCalls = toolCalls;
  return message;
}

export interface OllamaTransportOptions {
  name: string;
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export function createOllamaTransport(opts: OllamaTransportOptions): Transport {
  const headerBag = (): Record<string, string> => ({ ...(opts.headers ?? {}) });

  const requireModel = (model: ChatRequest["model"] | EmbedRequest["model"], what: string) => {
    if (model === undefined) {
      throw new ConfigurationError(
        `The Ollama transport requires ${what}. Pass model to the call or set a default on the client.`,
      );
    }
  };

  const transport: Transport = {
    async chat(req: ChatRequest, call?: CallOptions): Promise<ChatResponse> {
      requireModel(req.model, "req.model");
      const signal = effectiveSignal(call);
      const response = await rawRequest({
        baseURL: opts.baseURL,
        path: "/api/chat",
        method: "POST",
        apiKey: opts.apiKey,
        headers: headerBag(),
        body: buildBody(req, false),
        signal,
      });
      let payload: OllamaChatPayload & { error?: string };
      try {
        payload = (await response.json()) as OllamaChatPayload & { error?: string };
      } catch (cause) {
        if (isAbortError(cause)) throw cause;
        throw new APIError("Invalid JSON response from Ollama provider", { cause });
      }
      if (typeof payload.error === "string" && payload.error) {
        throw new APIError(payload.error, { body: payload });
      }
      return {
        id: payload.created_at ?? "",
        model: payload.model ?? modelRefOllama(req.model) ?? "",
        message: messageFromPayload(payload.message),
        finishReason: parseFinishReason(payload.done_reason),
        usage: usageFromPayload(payload),
        raw: payload,
      };
    },

    async *chatStream(req: ChatRequest, call?: CallOptions): AsyncIterable<ChatChunk> {
      requireModel(req.model, "req.model");
      const signal = effectiveSignal(call);
      const response = await rawRequest({
        baseURL: opts.baseURL,
        path: "/api/chat",
        method: "POST",
        apiKey: opts.apiKey,
        headers: headerBag(),
        body: buildBody(req, true),
        signal,
        stream: true,
      });
      let yielded = 0;
      for await (const line of ndjsonLines(response, signal)) {
        signal?.throwIfAborted?.();
        let payload: OllamaChatPayload & { error?: string };
        try {
          payload = JSON.parse(line) as OllamaChatPayload & { error?: string };
        } catch {
          continue;
        }
        if (typeof payload.error === "string" && payload.error) {
          throw new APIError(payload.error, { body: payload });
        }
        yielded += 1;
        const delta: ChatChunk["delta"] = {};
        const content = payload.message?.content;
        if (content) delta.content = content;
        const reasoning = payload.message?.thinking ?? payload.message?.reasoning_content;
        if (reasoning) delta.reasoningContent = reasoning;
        const toolCalls = payload.message?.tool_calls;
        if (toolCalls?.length) {
          delta.toolCalls = toolCalls.map((t, index) => ({
            index,
            id: t.id,
            function: {
              name: t.function?.name,
              arguments: argsToString(t.function?.arguments),
            },
          }));
        }
        const chunk: ChatChunk = {
          id: payload.created_at ?? "",
          model: payload.model ?? modelRefOllama(req.model) ?? "",
          delta,
          finishReason: payload.done ? parseFinishReason(payload.done_reason) : null,
          raw: payload,
        };
        if (payload.done) chunk.usage = usageFromPayload(payload);
        yield chunk;
      }
      if (yielded === 0) {
        throw new APIError(
          "Empty or invalid stream from Ollama provider: no usable events received",
        );
      }
    },

    async embed(req: EmbedRequest, call?: CallOptions): Promise<EmbedResponse> {
      requireModel(req.model, "req.model");
      const signal = effectiveSignal(call);
      const payload = await requestJSON<{
        embeddings?: number[][];
        embedding?: number[];
        prompt_eval_count?: number;
      }>({
        baseURL: opts.baseURL,
        path: "/api/embed",
        method: "POST",
        apiKey: opts.apiKey,
        headers: headerBag(),
        body: {
          model: modelRefOllama(req.model),
          input: req.input,
          truncate: true,
          ...(req.dimensions !== undefined ? { dimensions: req.dimensions } : {}),
        },
        signal,
      });
      let rows = payload.embeddings;
      if (!rows && Array.isArray(payload.embedding)) rows = [payload.embedding];
      if (!Array.isArray(rows)) {
        throw new APIError("Invalid embedding response from Ollama provider", {
          body: payload,
        });
      }
      const promptTokens = Number(payload.prompt_eval_count ?? 0);
      const safePrompt = Number.isFinite(promptTokens) ? promptTokens : 0;
      return {
        embeddings: rows,
        dimensions: rows[0]?.length ?? 0,
        usage: { promptTokens: safePrompt, completionTokens: 0, totalTokens: safePrompt },
        raw: payload,
      };
    },

    async listLocalModels(call?: CallOptions): Promise<LocalModel[]> {
      const payload = await requestJSON<{ models?: unknown[] }>({
        baseURL: opts.baseURL,
        path: "/api/tags",
        method: "GET",
        apiKey: opts.apiKey,
        headers: headerBag(),
        signal: effectiveSignal(call),
      });
      return (Array.isArray(payload.models) ? payload.models : []).map((item) => {
        const m = (item ?? {}) as Record<string, unknown>;
        const details = (m.details ?? {}) as Record<string, unknown>;
        const model: LocalModel = {
          tag: String(m.name ?? m.model ?? ""),
          name: String(m.model ?? m.name ?? ""),
          raw: item,
        };
        if (typeof m.size === "number") model.size = m.size;
        if (typeof details.parameter_size === "string")
          model.parameterSize = details.parameter_size;
        if (typeof details.quantization_level === "string") {
          model.quantization = details.quantization_level;
        }
        if (typeof m.modified_at === "string") model.modifiedAt = m.modified_at;
        return model;
      });
    },

    async pullModel(
      tag: string,
      opts2?: CallOptions & { onProgress?: (p: PullProgress) => void },
    ): Promise<void> {
      const signal = effectiveSignal(opts2);
      const response = await rawRequest({
        baseURL: opts.baseURL,
        path: "/api/pull",
        method: "POST",
        apiKey: opts.apiKey,
        headers: headerBag(),
        body: { name: tag, stream: true },
        signal,
        stream: true,
      });
      for await (const line of ndjsonLines(response, signal)) {
        signal?.throwIfAborted?.();
        let payload: PullProgress & { error?: string };
        try {
          payload = JSON.parse(line) as PullProgress & { error?: string };
        } catch {
          continue;
        }
        if (payload.error) throw new APIError(payload.error, { body: payload });
        await opts2?.onProgress?.(payload);
      }
    },
  };

  return transport;
}
