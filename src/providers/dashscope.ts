import { ConfigurationError } from "../errors";
import type { ChatRequest, EmbedRequest } from "../types";
import { createOpenAICompatTransport } from "./openai-compat";
import type { ProviderConfig } from "./types";

export const DASHSCOPE_INTERNATIONAL_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
export const DASHSCOPE_CHINA_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

function dashscopeExtras(body: Record<string, unknown>, req: ChatRequest): void {
  const extras: Record<string, unknown> = {};
  if (req.reasoningEffort !== undefined && req.thinkingBudget !== undefined) {
    throw new ConfigurationError(
      "reasoningEffort and thinkingBudget cannot be combined: DashScope rejects requests that set both reasoning_effort and thinking_budget.",
    );
  }
  if (req.reasoningEffort !== undefined && req.thinking === false) {
    throw new ConfigurationError(
      "reasoningEffort requires thinking. Remove thinking: false or drop reasoningEffort.",
    );
  }
  let enableThinking: boolean | undefined;
  if (req.thinking !== undefined) {
    enableThinking = req.thinking;
    extras.enable_thinking = req.thinking;
  } else if (req.thinkingBudget !== undefined || req.reasoningEffort !== undefined) {
    enableThinking = true;
    extras.enable_thinking = true;
  }
  // thinking_budget is only valid when enable_thinking is true. Never send the
  // contradictory { enable_thinking: false, thinking_budget: N } shape.
  if (req.thinkingBudget !== undefined && enableThinking !== false) {
    extras.thinking_budget = req.thinkingBudget;
  }
  if (req.reasoningEffort !== undefined) extras.reasoning_effort = req.reasoningEffort;
  if (req.preserveThinking !== undefined) extras.preserve_thinking = req.preserveThinking;
  if (req.enableSearch !== undefined) extras.enable_search = req.enableSearch;
  Object.assign(body, extras);
}

function dashscopeEmbedExtras(body: Record<string, unknown>, req: EmbedRequest): void {
  if (body.model === "text-embedding-v4" && typeof body.dimensions === "number") {
    if (body.dimensions > 2048) {
      throw new ConfigurationError(
        "text-embedding-v4 supports up to 2048 dimensions. Request a smaller dimension or use a provider/model with larger embedding support.",
      );
    }
  }
  if (req.textType !== undefined) body.text_type = req.textType;
  if (req.instruction !== undefined) body.instruct = req.instruction;
}

export function dashscopeProviderConfig(international = true, apiKey?: string): ProviderConfig {
  return {
    name: international ? "dashscope" : "dashscope-cn",
    baseURL: international ? DASHSCOPE_INTERNATIONAL_BASE_URL : DASHSCOPE_CHINA_BASE_URL,
    apiKey,
    kind: "openai-compat",
    mapRequestBody: dashscopeExtras,
    mapEmbedBody: dashscopeEmbedExtras,
  };
}

export function createDashScopeTransport(config: ProviderConfig) {
  const defaults = dashscopeProviderConfig(true);
  return createOpenAICompatTransport({
    name: config.name,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    headers: config.headers,
    mapRequestBody: config.mapRequestBody ?? defaults.mapRequestBody,
    mapEmbedBody: config.mapEmbedBody ?? defaults.mapEmbedBody,
  });
}
