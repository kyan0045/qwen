import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ContentPart,
  EmbedRequest,
  EmbedResponse,
  FinishReason,
  Message,
  ToolCall,
  ToolCallDelta,
  Usage,
} from "../types";
import { rawRequest, requestJSON, sseData } from "./http";
import type { CallOptions, Transport } from "./types";

function toWireMessage(m: Message): Record<string, unknown> {
  const out: Record<string, unknown> = { role: m.role };
  if (m.content !== undefined && m.content !== null) {
    out.content = m.content;
  } else {
    out.content = m.role === "assistant" && m.toolCalls ? null : "";
  }
  if (m.name) out.name = m.name;
  if (m.toolCallId) out.tool_call_id = m.toolCallId;
  if (m.reasoningContent) out.reasoning_content = m.reasoningContent;
  if (m.toolCalls?.length) {
    out.tool_calls = m.toolCalls.map((t: ToolCall) => ({
      id: t.id,
      type: t.type,
      function: { name: t.function.name, arguments: t.function.arguments },
    }));
  }
  return out;
}

export function buildChatBody(req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: req.messages.map(toWireMessage),
  };
  if (req.model) body.model = req.model;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.topP !== undefined) body.top_p = req.topP;
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  if (req.stop !== undefined) body.stop = req.stop;
  if (req.presencePenalty !== undefined) body.presence_penalty = req.presencePenalty;
  if (req.frequencyPenalty !== undefined) body.frequency_penalty = req.frequencyPenalty;
  if (req.seed !== undefined) body.seed = req.seed;
  if (req.logitBias !== undefined) body.logit_bias = req.logitBias;
  if (req.user !== undefined) body.user = req.user;
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
        strict: t.function.strict,
      },
    }));
  }
  if (req.toolChoice !== undefined) {
    body.tool_choice =
      typeof req.toolChoice === "string"
        ? req.toolChoice
        : { type: "function", function: { name: req.toolChoice.function.name } };
  }
  if (req.responseFormat !== undefined) body.response_format = req.responseFormat;
  return body;
}

function parseUsage(raw: unknown): Usage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const prompt = Number(u.prompt_tokens ?? u.promptTokens ?? 0);
  const completion = Number(u.completion_tokens ?? u.completionTokens ?? 0);
  const total = Number(u.total_tokens ?? u.totalTokens ?? prompt + completion);
  const promptDetails = u.prompt_tokens_details as Record<string, unknown> | undefined;
  const completionDetails = u.completion_tokens_details as Record<string, unknown> | undefined;
  const usage: Usage = {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
  const cached = promptDetails?.cached_tokens;
  if (typeof cached === "number") usage.cachedTokens = cached;
  const reasoning = completionDetails?.reasoning_tokens;
  if (typeof reasoning === "number") usage.reasoningTokens = reasoning;
  return usage;
}

function parseFinishReason(raw: unknown): FinishReason {
  if (raw === null || raw === undefined) return null;
  const value = String(raw);
  switch (value) {
    case "stop":
    case "length":
    case "tool_calls":
    case "content_filter":
    case "function_call":
      return value;
    default:
      return null;
  }
}

function parseToolCalls(raw: unknown): ToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((item, index) => {
    const t = (item ?? {}) as Record<string, unknown>;
    const fn = (t.function ?? {}) as Record<string, unknown>;
    return {
      id: typeof t.id === "string" ? t.id : `call_${index}`,
      type: "function" as const,
      function: {
        name: typeof fn.name === "string" ? fn.name : "",
        arguments: typeof fn.arguments === "string" ? fn.arguments : "{}",
      },
    };
  });
}

function parseContent(raw: unknown): string | ContentPart[] | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw as ContentPart[];
  return String(raw);
}

function messageFromWire(raw: unknown): Message {
  const m = (raw ?? {}) as Record<string, unknown>;
  const message: Message = {
    role: "assistant",
    content: parseContent(m.content),
  };
  const reasoning = m.reasoning_content ?? m.reasoningContent ?? m.thinking;
  if (typeof reasoning === "string" && reasoning) message.reasoningContent = reasoning;
  const toolCalls = parseToolCalls(m.tool_calls ?? m.toolCalls);
  if (toolCalls) message.toolCalls = toolCalls;
  return message;
}

export function parseChatResponse(payload: unknown): ChatResponse {
  const p = (payload ?? {}) as Record<string, unknown>;
  const choices = (Array.isArray(p.choices) ? p.choices : []) as Record<string, unknown>[];
  const choice = choices[0] ?? {};
  return {
    id: typeof p.id === "string" ? p.id : "",
    model: typeof p.model === "string" ? p.model : "",
    message: messageFromWire(choice.message),
    finishReason: parseFinishReason(choice.finish_reason),
    usage: parseUsage(p.usage),
    raw: payload,
  };
}

function parseChunk(payload: unknown): ChatChunk {
  const p = (payload ?? {}) as Record<string, unknown>;
  const choices = (Array.isArray(p.choices) ? p.choices : []) as Record<string, unknown>[];
  const choice = choices[0] ?? {};
  const delta = (choice.delta ?? {}) as Record<string, unknown>;
  const chunk: ChatChunk = {
    id: typeof p.id === "string" ? p.id : "",
    model: typeof p.model === "string" ? p.model : "",
    delta: {},
    finishReason: parseFinishReason(choice.finish_reason),
    raw: payload,
  };
  if (typeof delta.content === "string" && delta.content) chunk.delta.content = delta.content;
  const reasoning = delta.reasoning_content ?? delta.reasoningContent ?? delta.thinking;
  if (typeof reasoning === "string" && reasoning) chunk.delta.reasoningContent = reasoning;
  const toolCalls = delta.tool_calls ?? delta.toolCalls;
  if (Array.isArray(toolCalls) && toolCalls.length) {
    chunk.delta.toolCalls = toolCalls.map((item, index) => {
      const t = (item ?? {}) as Record<string, unknown>;
      const fn = (t.function ?? {}) as Record<string, unknown>;
      const out: ToolCallDelta = {
        index: typeof t.index === "number" ? t.index : index,
      };
      if (typeof t.id === "string") out.id = t.id;
      if (typeof fn.name === "string") out.function = { ...(out.function ?? {}), name: fn.name };
      if (typeof fn.arguments === "string") {
        out.function = { ...(out.function ?? {}), arguments: fn.arguments };
      }
      return out;
    });
  }
  const usage = parseUsage(p.usage);
  if (usage) chunk.usage = usage;
  return chunk;
}

export interface OpenAICompatOptions {
  name: string;
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  mapRequestBody?: (body: Record<string, unknown>, req: ChatRequest) => void;
  mapEmbedBody?: (body: Record<string, unknown>, req: EmbedRequest) => void;
}

export function createOpenAICompatTransport(opts: OpenAICompatOptions): Transport {
  const headers = () => ({ ...(opts.headers ?? {}) });

  async function send(req: ChatRequest, stream: boolean, call?: CallOptions) {
    const body = buildChatBody(req);
    if (opts.mapRequestBody) opts.mapRequestBody(body, req);
    body.stream = stream;
    if (stream) {
      body.stream_options = { include_usage: true };
    }
    return rawRequest({
      baseURL: opts.baseURL,
      path: "/chat/completions",
      apiKey: opts.apiKey,
      headers: headers(),
      body,
      signal: call?.signal,
      stream,
    });
  }

  return {
    async chat(req, call) {
      const response = await send(req, false, call);
      const payload = await response.json();
      return parseChatResponse(payload);
    },

    async *chatStream(req, call) {
      const response = await send(req, true, call);
      for await (const data of sseData(response)) {
        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }
        yield parseChunk(payload);
      }
    },

    async embed(req, call) {
      const body: Record<string, unknown> = {
        input: req.input,
      };
      if (req.model) body.model = req.model;
      if (req.dimensions !== undefined) body.dimensions = req.dimensions;
      if (req.user !== undefined) body.user = req.user;
      if (opts.mapEmbedBody) opts.mapEmbedBody(body, req);
      const payload = await requestJSON<{
        data?: unknown[];
        usage?: unknown;
        embeddings?: unknown;
      }>({
        baseURL: opts.baseURL,
        path: "/embeddings",
        apiKey: opts.apiKey,
        headers: headers(),
        body,
        signal: call?.signal,
      });
      const rows = Array.isArray(payload.data)
        ? payload.data
            .map((item) => (item as { embedding?: unknown }).embedding)
            .filter((x): x is number[] => Array.isArray(x))
        : [];
      return {
        embeddings: rows,
        dimensions: rows[0]?.length ?? 0,
        usage: parseUsage(payload.usage),
        raw: payload,
      };
    },

    async listLocalModels(call) {
      const payload = await requestJSON<{ data?: unknown[] }>({
        baseURL: opts.baseURL,
        path: "/models",
        method: "GET",
        apiKey: opts.apiKey,
        headers: headers(),
        signal: call?.signal,
      });
      return (Array.isArray(payload.data) ? payload.data : []).map((item) => {
        const m = (item ?? {}) as Record<string, unknown>;
        return {
          tag: String(m.id ?? ""),
          name: String(m.id ?? ""),
          raw: item,
        };
      });
    },

    async pullModel(tag) {
      throw new Error(`Pulling models is only supported on the Ollama provider. Requested: ${tag}`);
    },
  };
}
