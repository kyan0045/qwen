import type { QwenCapability, QwenModel } from "./catalog";
import {
  FAMILY_RANK,
  QWEN2_5_72B,
  QWEN2_5_CODER_32B,
  QWEN2_5_VL_32B,
  QWEN3_0_6B,
  QWEN3_1_7B,
  QWEN3_4B,
  QWEN3_5_0_8B,
  QWEN3_5_2B,
  QWEN3_5_4B,
  QWEN3_5_9B,
  QWEN3_5_27B,
  QWEN3_5_27B_CODING,
  QWEN3_5_35B,
  QWEN3_5_35B_CODING,
  QWEN3_5_122B,
  QWEN3_5_397B_CLOUD,
  QWEN3_5_FLASH,
  QWEN3_5_PLUS,
  QWEN3_6_27B,
  QWEN3_6_35B,
  QWEN3_6_FLASH,
  QWEN3_6_MAX_PREVIEW,
  QWEN3_6_PLUS,
  QWEN3_7_FLASH,
  QWEN3_7_MAX,
  QWEN3_7_PLUS,
  QWEN3_8B,
  QWEN3_8_2_4T_A95B,
  QWEN3_8_27B,
  QWEN3_8_FLASH,
  QWEN3_8_FLASH_API,
  QWEN3_8_LIVETRANSLATE,
  QWEN3_8_MAX,
  QWEN3_8_MAX_0902,
  QWEN3_8_OMNI_FLASH,
  QWEN3_14B,
  QWEN3_30B_A3B,
  QWEN3_32B,
  QWEN3_235B_A22B,
  QWEN3_CODER_30B,
  QWEN3_CODER_480B,
  QWEN3_CODER_NEXT,
  QWEN3_EMBEDDING_0_6B,
  QWEN3_EMBEDDING_4B,
  QWEN3_EMBEDDING_8B,
  QWEN3_NEXT_80B,
  QWEN3_VL_8B,
  QWEN3_VL_32B,
  QWEN3_VL_235B,
  QWEN_MAX,
  QWEN_PLUS,
  QWEN_TURBO,
  QWQ_32B,
} from "./catalog";

export * from "./catalog";

export const models: readonly QwenModel[] = Object.freeze([
  QWEN3_8_27B,
  QWEN3_8_FLASH,
  QWEN3_8_MAX,
  QWEN3_8_MAX_0902,
  QWEN3_8_2_4T_A95B,
  QWEN3_8_FLASH_API,
  QWEN3_8_OMNI_FLASH,
  QWEN3_8_LIVETRANSLATE,
  QWEN3_7_MAX,
  QWEN3_7_PLUS,
  QWEN3_7_FLASH,
  QWEN3_6_27B,
  QWEN3_6_35B,
  QWEN3_6_PLUS,
  QWEN3_6_FLASH,
  QWEN3_6_MAX_PREVIEW,
  QWEN3_5_0_8B,
  QWEN3_5_2B,
  QWEN3_5_4B,
  QWEN3_5_9B,
  QWEN3_5_27B,
  QWEN3_5_27B_CODING,
  QWEN3_5_35B,
  QWEN3_5_35B_CODING,
  QWEN3_5_122B,
  QWEN3_5_397B_CLOUD,
  QWEN3_5_PLUS,
  QWEN3_5_FLASH,
  QWEN3_NEXT_80B,
  QWEN3_CODER_NEXT,
  QWEN3_CODER_30B,
  QWEN3_CODER_480B,
  QWEN3_0_6B,
  QWEN3_1_7B,
  QWEN3_4B,
  QWEN3_8B,
  QWEN3_14B,
  QWEN3_32B,
  QWEN3_30B_A3B,
  QWEN3_235B_A22B,
  QWEN3_VL_8B,
  QWEN3_VL_32B,
  QWEN3_VL_235B,
  QWEN3_EMBEDDING_0_6B,
  QWEN3_EMBEDDING_4B,
  QWEN3_EMBEDDING_8B,
  QWQ_32B,
  QWEN2_5_72B,
  QWEN2_5_CODER_32B,
  QWEN2_5_VL_32B,
  QWEN_TURBO,
  QWEN_PLUS,
  QWEN_MAX,
]);

export const modelsById: ReadonlyMap<string, QwenModel> = new Map(models.map((m) => [m.id, m]));

export function getModel(id: string): QwenModel | undefined {
  return modelsById.get(id);
}

export function resolveModel(ref: string | QwenModel): QwenModel | undefined {
  if (typeof ref !== "string") return ref;
  const exact = modelsById.get(ref);
  if (exact) return exact;
  const lower = ref.toLowerCase();
  return (
    models.find((m) => m.ollamaTag?.toLowerCase() === lower) ??
    models.find((m) => m.ollamaTag?.split(":")[0]?.toLowerCase() === lower) ??
    models.find((m) => m.dashscopeId?.toLowerCase() === lower) ??
    models.find((m) => m.openrouterId?.toLowerCase() === lower) ??
    models.find((m) => m.id.toLowerCase() === lower) ??
    models.find((m) => m.name.toLowerCase() === lower)
  );
}

export function requireModel(ref: string | QwenModel): QwenModel {
  const found = resolveModel(ref);
  if (!found) {
    throw new Error(
      `Unknown Qwen model "${ref}". Run \`qwen models\` to list the catalog, or pass a raw model id the provider accepts.`,
    );
  }
  return found;
}

export interface RecommendOptions {
  use?: "chat" | "coding" | "reasoning" | "translate" | "vision" | "embed";
  local?: boolean;
  maxParams?: number | string;
  thinking?: boolean;
  vision?: boolean;
  tools?: boolean;
  code?: boolean;
  minContext?: number;
  includePreview?: boolean;
  includeLegacy?: boolean;
  includeCloud?: boolean;
}

function parseParamLimit(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  const match = /^(\d+(?:\.\d+)?)\s*b?$/i.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

function has(m: QwenModel, cap: QwenCapability): boolean {
  return m.capabilities.includes(cap);
}

function score(m: QwenModel, opts: RecommendOptions): number {
  let s = FAMILY_RANK[m.family];
  if (m.preview) s -= 15;
  if (m.cloudOnly) s -= 5;
  if (opts.use === "coding") {
    if (m.family.startsWith("qwen3-coder")) s += 90;
    if (m.id.includes("coding")) s += 70;
    if (has(m, "code")) s += 25;
  }
  if (opts.use === "reasoning") {
    if (m.thinking === "always") s += 45;
    if (m.thinking === "hybrid") s += 30;
  }
  if (opts.use === "vision" && has(m, "vision")) s += 60;
  if (opts.use === "embed" && has(m, "embed")) {
    s += 100;
    s += (m.embeddingDimensions ?? 0) / 500;
    return s;
  }
  if (opts.use === "translate" && m.family.startsWith("qwen3")) s += 10;
  if (opts.thinking && m.thinking !== "none") s += 15;
  if (m.paramCount !== undefined) s -= Math.log10(m.paramCount + 1) * 6;
  return s;
}

export function recommendAll(opts: RecommendOptions = {}): QwenModel[] {
  const limit = parseParamLimit(opts.maxParams);
  if (opts.maxParams !== undefined && (limit === undefined || !Number.isFinite(limit))) {
    throw new Error(
      `Invalid maxParams ${JSON.stringify(opts.maxParams)}. Use a value such as 32 or "32b".`,
    );
  }
  const want: QwenCapability[] = [];
  if (opts.use === "embed") want.push("embed");
  if (opts.use === "vision" || opts.vision) want.push("vision");
  if (opts.use === "coding" || opts.code) want.push("code");
  if (opts.tools) want.push("tools");
  if (opts.thinking) want.push("thinking");
  if (opts.use === "chat" && want.length === 0) want.push("chat");

  const filtered = models.filter((m) => {
    if (m.legacy && !opts.includeLegacy) return false;
    if (m.preview && !opts.includePreview) return false;
    if (m.cloudOnly && !opts.includeCloud) return false;
    if (opts.local && !m.ollamaTag) return false;
    if (opts.local && m.cloudOnly) return false;
    if (limit !== undefined) {
      if (m.paramCount === undefined || m.paramCount > limit) return false;
    }
    if (opts.minContext !== undefined && m.contextWindow < opts.minContext) return false;
    return want.every((c) => has(m, c));
  });

  return filtered.sort((a, b) => score(b, opts) - score(a, opts));
}

export function recommend(opts: RecommendOptions = {}): QwenModel {
  const list = recommendAll(opts);
  const first = list[0];
  if (!first) {
    throw new Error(
      `No Qwen model matches ${JSON.stringify(opts)}. Relax the constraints or set includeLegacy: true.`,
    );
  }
  return first;
}
