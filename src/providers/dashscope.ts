import { ConfigurationError } from "../errors";
import type { ChatRequest, EmbedRequest } from "../types";
import { createOpenAICompatTransport } from "./openai-compat";
import type { ProviderConfig } from "./types";

export const DASHSCOPE_INTERNATIONAL_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
export const DASHSCOPE_CHINA_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

function dashscopeExtras(body: Record<string, unknown>, req: ChatRequest): void {
  const extras: Record<string, unknown> = {};
  if (req.thinking !== undefined) {
    extras.enable_thinking = req.thinking;
  } else if (req.thinkingBudget !== undefined) {
    extras.enable_thinking = true;
  }
  if (req.thinkingBudget !== undefined) extras.thinking_budget = req.thinkingBudget;
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
  return createOpenAICompatTransport({
    name: config.name,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    headers: config.headers,
    mapRequestBody: config.mapRequestBody,
    mapEmbedBody: config.mapEmbedBody,
  });
}
