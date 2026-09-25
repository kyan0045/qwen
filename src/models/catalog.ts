export type QwenCapability =
  | "chat"
  | "thinking"
  | "tools"
  | "vision"
  | "code"
  | "embed"
  | "translate";

export type QwenThinkingMode = "hybrid" | "always" | "none";

export type QwenFamily =
  | "qwen3.8-flash"
  | "qwen3.8"
  | "qwen3.6"
  | "qwen3.5"
  | "qwen3-next"
  | "qwen3-coder-next"
  | "qwen3-coder"
  | "qwen3"
  | "qwen3-vl"
  | "qwen3-embedding"
  | "qwq"
  | "qwen2.5-coder"
  | "qwen2.5"
  | "qwen2.5-vl"
  | "qwen2"
  | "qwen2-math"
  | "codeqwen"
  | "qwen1.5";

export interface QwenModel {
  id: string;
  name: string;
  family: QwenFamily;
  params?: string;
  paramCount?: number;
  contextWindow: number;
  maxOutput: number;
  capabilities: readonly QwenCapability[];
  thinking: QwenThinkingMode;
  legacy?: boolean;
  preview?: boolean;
  cloudOnly?: boolean;
  embeddingDimensions?: number;
  ollamaTag?: string;
  dashscopeId?: string;
  notes?: string;
}

export const FAMILY_RANK: Record<QwenFamily, number> = {
  "qwen3.8-flash": 92,
  "qwen3.8": 100,
  "qwen3.6": 94,
  "qwen3.5": 88,
  "qwen3-next": 82,
  "qwen3-coder-next": 84,
  "qwen3-coder": 80,
  qwen3: 72,
  "qwen3-vl": 70,
  "qwen3-embedding": 70,
  qwq: 66,
  "qwen2.5-coder": 42,
  "qwen2.5": 36,
  "qwen2.5-vl": 34,
  qwen2: 22,
  "qwen2-math": 20,
  codeqwen: 18,
  "qwen1.5": 8,
};

export const QWEN3_8_27B: QwenModel = {
  id: "qwen3.8-27b",
  name: "Qwen3.8 27B",
  family: "qwen3.8",
  params: "27B",
  paramCount: 27,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "vision", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.8:27b",
  notes:
    "Newest stable release. Gains on coding, professional work, research and long-horizon agentic tasks.",
};

export const QWEN3_8_FLASH: QwenModel = {
  id: "qwen3.8-flash",
  name: "Qwen3.8 Flash (Qwen4 preview)",
  family: "qwen3.8-flash",
  params: undefined,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "vision"],
  thinking: "hybrid",
  preview: true,
  ollamaTag: "qwen3.8-flash-next",
  notes: "Experimental preview of the architecture that will underpin Qwen4.",
};

export const QWEN3_6_27B: QwenModel = {
  id: "qwen3.6-27b",
  name: "Qwen3.6 27B",
  family: "qwen3.6",
  params: "27B",
  paramCount: 27,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "vision", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.6:27b",
  notes: "Upgrades to agentic coding and thinking preservation.",
};

export const QWEN3_6_35B: QwenModel = {
  id: "qwen3.6-35b",
  name: "Qwen3.6 35B",
  family: "qwen3.6",
  params: "35B",
  paramCount: 35,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "vision", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.6:35b",
};

export const QWEN3_5_0_8B: QwenModel = {
  id: "qwen3.5-0.8b",
  name: "Qwen3.5 0.8B",
  family: "qwen3.5",
  params: "0.8B",
  paramCount: 0.8,
  contextWindow: 262144,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "vision"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:0.8b",
  notes: "Tiny multimodal model; fits on modest hardware.",
};

export const QWEN3_5_2B: QwenModel = {
  id: "qwen3.5-2b",
  name: "Qwen3.5 2B",
  family: "qwen3.5",
  params: "2B",
  paramCount: 2,
  contextWindow: 262144,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "vision"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:2b",
};

export const QWEN3_5_4B: QwenModel = {
  id: "qwen3.5-4b",
  name: "Qwen3.5 4B",
  family: "qwen3.5",
  params: "4B",
  paramCount: 4,
  contextWindow: 262144,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "vision"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:4b",
};

export const QWEN3_5_9B: QwenModel = {
  id: "qwen3.5-9b",
  name: "Qwen3.5 9B",
  family: "qwen3.5",
  params: "9B",
  paramCount: 9,
  contextWindow: 262144,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "vision", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:9b",
  notes: "Default tag for the Qwen3.5 family.",
};

export const QWEN3_5_27B: QwenModel = {
  id: "qwen3.5-27b",
  name: "Qwen3.5 27B",
  family: "qwen3.5",
  params: "27B",
  paramCount: 27,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "vision", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:27b",
};

export const QWEN3_5_27B_CODING: QwenModel = {
  id: "qwen3.5-27b-coding",
  name: "Qwen3.5 27B Coding",
  family: "qwen3.5",
  params: "27B",
  paramCount: 27,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:27b-coding",
  notes: "Code-tuned variant of Qwen3.5 27B.",
};

export const QWEN3_5_35B: QwenModel = {
  id: "qwen3.5-35b-a3b",
  name: "Qwen3.5 35B-A3B",
  family: "qwen3.5",
  params: "35B-A3B",
  paramCount: 35,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "vision", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:35b-a3b",
  notes: "MoE with 3B activated parameters; strong quality-per-FLOP.",
};

export const QWEN3_5_35B_CODING: QwenModel = {
  id: "qwen3.5-35b-a3b-coding",
  name: "Qwen3.5 35B-A3B Coding",
  family: "qwen3.5",
  params: "35B-A3B",
  paramCount: 35,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:35b-a3b-coding",
};

export const QWEN3_5_122B: QwenModel = {
  id: "qwen3.5-122b-a10b",
  name: "Qwen3.5 122B-A10B",
  family: "qwen3.5",
  params: "122B-A10B",
  paramCount: 122,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "vision", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3.5:122b-a10b",
};

export const QWEN3_5_397B_CLOUD: QwenModel = {
  id: "qwen3.5-397b-cloud",
  name: "Qwen3.5 397B (cloud)",
  family: "qwen3.5",
  params: "397B",
  paramCount: 397,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "vision", "code"],
  thinking: "hybrid",
  cloudOnly: true,
  ollamaTag: "qwen3.5:397b-cloud",
  notes: "Runs via Ollama cloud rather than locally.",
};

export const QWEN3_NEXT_80B: QwenModel = {
  id: "qwen3-next-80b",
  name: "Qwen3-Next 80B",
  family: "qwen3-next",
  params: "80B",
  paramCount: 80,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3-next:80b",
  notes: "Parameter-efficiency and inference-speed focused architecture.",
};

export const QWEN3_CODER_NEXT: QwenModel = {
  id: "qwen3-coder-next",
  name: "Qwen3-Coder-Next",
  family: "qwen3-coder-next",
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3-coder-next",
  notes: "Coding-focused model optimised for agentic workflows and local development.",
};

export const QWEN3_CODER_30B: QwenModel = {
  id: "qwen3-coder-30b",
  name: "Qwen3-Coder 30B-A3B",
  family: "qwen3-coder",
  params: "30B-A3B",
  paramCount: 30,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3-coder:30b",
  notes: "30B total / 3.3B activated. 256K native context, up to 1M with YaRN.",
};

export const QWEN3_CODER_480B: QwenModel = {
  id: "qwen3-coder-480b",
  name: "Qwen3-Coder 480B-A35B",
  family: "qwen3-coder",
  params: "480B-A35B",
  paramCount: 480,
  contextWindow: 262144,
  maxOutput: 65536,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3-coder:480b",
  dashscopeId: "qwen3-coder-plus",
  notes: "Flagship agentic coder. 256K native, 1M with YaRN. Needs ~250GB for local.",
};

export const QWEN3_0_6B: QwenModel = {
  id: "qwen3-0.6b",
  name: "Qwen3 0.6B",
  family: "qwen3",
  params: "0.6B",
  paramCount: 0.6,
  contextWindow: 32768,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools"],
  thinking: "hybrid",
  ollamaTag: "qwen3:0.6b",
  dashscopeId: "qwen3-0.6b",
};

export const QWEN3_1_7B: QwenModel = {
  id: "qwen3-1.7b",
  name: "Qwen3 1.7B",
  family: "qwen3",
  params: "1.7B",
  paramCount: 1.7,
  contextWindow: 32768,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools"],
  thinking: "hybrid",
  ollamaTag: "qwen3:1.7b",
  dashscopeId: "qwen3-1.7b",
};

export const QWEN3_4B: QwenModel = {
  id: "qwen3-4b",
  name: "Qwen3 4B",
  family: "qwen3",
  params: "4B",
  paramCount: 4,
  contextWindow: 32768,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3:4b",
  dashscopeId: "qwen3-4b",
  notes: "Rivals Qwen2.5-72B-Instruct on many benchmarks.",
};

export const QWEN3_8B: QwenModel = {
  id: "qwen3-8b",
  name: "Qwen3 8B",
  family: "qwen3",
  params: "8B",
  paramCount: 8,
  contextWindow: 131072,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3:8b",
  dashscopeId: "qwen3-8b",
};

export const QWEN3_14B: QwenModel = {
  id: "qwen3-14b",
  name: "Qwen3 14B",
  family: "qwen3",
  params: "14B",
  paramCount: 14,
  contextWindow: 131072,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3:14b",
  dashscopeId: "qwen3-14b",
};

export const QWEN3_32B: QwenModel = {
  id: "qwen3-32b",
  name: "Qwen3 32B",
  family: "qwen3",
  params: "32B",
  paramCount: 32,
  contextWindow: 131072,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3:32b",
  dashscopeId: "qwen3-32b",
};

export const QWEN3_30B_A3B: QwenModel = {
  id: "qwen3-30b-a3b",
  name: "Qwen3 30B-A3B",
  family: "qwen3",
  params: "30B-A3B",
  paramCount: 30,
  contextWindow: 131072,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3:30b-a3b",
  dashscopeId: "qwen3-30b-a3b",
  notes: "MoE: 128 experts, 8 activated. Outperforms QwQ-32B at 1/10th activated params.",
};

export const QWEN3_235B_A22B: QwenModel = {
  id: "qwen3-235b-a22b",
  name: "Qwen3 235B-A22B",
  family: "qwen3",
  params: "235B-A22B",
  paramCount: 235,
  contextWindow: 131072,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "hybrid",
  ollamaTag: "qwen3:235b-a22b",
  dashscopeId: "qwen3-235b-a22b",
  notes: "Flagship Qwen3 MoE.",
};

export const QWEN3_VL_8B: QwenModel = {
  id: "qwen3-vl-8b",
  name: "Qwen3-VL 8B",
  family: "qwen3-vl",
  params: "8B",
  paramCount: 8,
  contextWindow: 131072,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "vision"],
  thinking: "hybrid",
  ollamaTag: "qwen3-vl:8b",
  dashscopeId: "qwen3-vl-8b",
};

export const QWEN3_VL_32B: QwenModel = {
  id: "qwen3-vl-32b",
  name: "Qwen3-VL 32B",
  family: "qwen3-vl",
  params: "32B",
  paramCount: 32,
  contextWindow: 131072,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "vision"],
  thinking: "hybrid",
  ollamaTag: "qwen3-vl:32b",
  dashscopeId: "qwen3-vl-32b",
};

export const QWEN3_VL_235B: QwenModel = {
  id: "qwen3-vl-235b",
  name: "Qwen3-VL 235B",
  family: "qwen3-vl",
  params: "235B",
  paramCount: 235,
  contextWindow: 131072,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "vision"],
  thinking: "hybrid",
  ollamaTag: "qwen3-vl:235b",
  dashscopeId: "qwen3-vl-235b-a22b",
  notes: "Most powerful vision-language model in the Qwen family.",
};

export const QWEN3_EMBEDDING_0_6B: QwenModel = {
  id: "qwen3-embedding-0.6b",
  name: "Qwen3-Embedding 0.6B",
  family: "qwen3-embedding",
  params: "0.6B",
  paramCount: 0.6,
  contextWindow: 32768,
  maxOutput: 0,
  capabilities: ["embed"],
  thinking: "none",
  embeddingDimensions: 1024,
  ollamaTag: "qwen3-embedding:0.6b",
  notes: "Output dims 32-1024.",
};

export const QWEN3_EMBEDDING_4B: QwenModel = {
  id: "qwen3-embedding-4b",
  name: "Qwen3-Embedding 4B",
  family: "qwen3-embedding",
  params: "4B",
  paramCount: 4,
  contextWindow: 32768,
  maxOutput: 0,
  capabilities: ["embed"],
  thinking: "none",
  embeddingDimensions: 2560,
  ollamaTag: "qwen3-embedding:4b",
};

export const QWEN3_EMBEDDING_8B: QwenModel = {
  id: "qwen3-embedding-8b",
  name: "Qwen3-Embedding 8B",
  family: "qwen3-embedding",
  params: "8B",
  paramCount: 8,
  contextWindow: 32768,
  maxOutput: 0,
  capabilities: ["embed"],
  thinking: "none",
  embeddingDimensions: 4096,
  ollamaTag: "qwen3-embedding:8b",
  dashscopeId: "text-embedding-v4",
  notes:
    "Ranked No.1 on MTEB multilingual (June 2025, 70.58). Output dims 32-4096, 100+ languages.",
};

export const QWQ_32B: QwenModel = {
  id: "qwq-32b",
  name: "QwQ 32B",
  family: "qwq",
  params: "32B",
  paramCount: 32,
  contextWindow: 32768,
  maxOutput: 32768,
  capabilities: ["chat", "thinking", "tools", "code"],
  thinking: "always",
  ollamaTag: "qwq:32b",
  dashscopeId: "qwq-plus",
  notes: "Dedicated reasoning model. Always thinks; there is no non-thinking mode.",
};

export const QWEN2_5_72B: QwenModel = {
  id: "qwen2.5-72b",
  name: "Qwen2.5 72B",
  family: "qwen2.5",
  params: "72B",
  paramCount: 72,
  contextWindow: 131072,
  maxOutput: 8192,
  capabilities: ["chat", "tools", "code"],
  thinking: "none",
  legacy: true,
  ollamaTag: "qwen2.5:72b",
  dashscopeId: "qwen2.5-72b-instruct",
};

export const QWEN2_5_CODER_32B: QwenModel = {
  id: "qwen2.5-coder-32b",
  name: "Qwen2.5-Coder 32B",
  family: "qwen2.5-coder",
  params: "32B",
  paramCount: 32,
  contextWindow: 131072,
  maxOutput: 8192,
  capabilities: ["chat", "tools", "code"],
  thinking: "none",
  legacy: true,
  ollamaTag: "qwen2.5-coder:32b",
  dashscopeId: "qwen2.5-coder-32b-instruct",
};

export const QWEN2_5_VL_32B: QwenModel = {
  id: "qwen2.5-vl-32b",
  name: "Qwen2.5-VL 32B",
  family: "qwen2.5-vl",
  params: "32B",
  paramCount: 32,
  contextWindow: 131072,
  maxOutput: 8192,
  capabilities: ["chat", "vision"],
  thinking: "none",
  legacy: true,
  ollamaTag: "qwen2.5vl:32b",
  dashscopeId: "qwen2.5-vl-32b-instruct",
};

export const QWEN_TURBO: QwenModel = {
  id: "qwen-turbo",
  name: "Qwen-Turbo",
  family: "qwen2.5",
  contextWindow: 1000000,
  maxOutput: 8192,
  capabilities: ["chat"],
  thinking: "none",
  dashscopeId: "qwen-turbo",
  cloudOnly: true,
  notes: "Hosted only. Cheapest hosted option with a 1M-token context window.",
};

export const QWEN_PLUS: QwenModel = {
  id: "qwen-plus",
  name: "Qwen-Plus",
  family: "qwen2.5",
  contextWindow: 131072,
  maxOutput: 8192,
  capabilities: ["chat", "tools", "code"],
  thinking: "none",
  dashscopeId: "qwen-plus",
  cloudOnly: true,
};

export const QWEN_MAX: QwenModel = {
  id: "qwen-max",
  name: "Qwen-Max",
  family: "qwen2.5",
  contextWindow: 32768,
  maxOutput: 8192,
  capabilities: ["chat", "tools", "code"],
  thinking: "none",
  dashscopeId: "qwen-max",
  cloudOnly: true,
  notes: "Hosted flagship of the Qwen2.5 era.",
};
