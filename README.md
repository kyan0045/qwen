# qwen

[![npm version](https://img.shields.io/npm/v/qwen.svg)](https://www.npmjs.com/package/qwen) [![npm downloads](https://img.shields.io/npm/dm/qwen.svg)](https://www.npmjs.com/package/qwen) [![CI](https://github.com/kyan0045/qwen/actions/workflows/ci.yml/badge.svg)](https://github.com/kyan0045/qwen/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/github/license/kyan0045/qwen.svg)](https://github.com/kyan0045/qwen/blob/main/LICENSE)

**Unofficial** TypeScript toolkit for [Qwen](https://qwenlm.github.io/) models: a typed model catalog, a multi-provider client (DashScope / OpenAI-compatible / local Ollama), and a fast CLI.

Zero runtime dependencies. Requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`.

---

## Why

Three things nobody else on npm combines:

1. **A typed model catalog with `recommend()`.** The naming is genuinely hard to follow - `qwen3.5:27b`, `qwen3.6:27b` and `qwen3.8:27b` are different models, `qwen3-coder:30b` is a 30B-A3B MoE, and the bare `qwen` repo on Ollama is still **Qwen 1.5**. This package knows all of that.
2. **One interface, three backends** - Alibaba Cloud Model Studio (DashScope), any OpenAI-compatible host, and local Ollama.
3. **Qwen-native semantics** - hybrid thinking mode, thinking budgets, and DashScope's `enable_search` - instead of a generic OpenAI shim.

For the full DashScope surface (images, speech, fine-tunes, assistants) use Alibaba's own [`dashscope-sdk-official`](https://www.npmjs.com/package/dashscope-sdk-official). For an agentic coding CLI see [`@qwen-code/qwen-code`](https://www.npmjs.com/package/@qwen-code/qwen-code). This package is the layer in between.

## Install

```bash
npm install qwen
# or run the CLI directly
npx qwen "explain quantum tunnelling to a 12 year old"
```

## The catalog

```ts
import { QWEN3_8_27B, QWEN3_CODER_480B, recommend, models } from "qwen";

QWEN3_8_27B.contextWindow;      // 262144
QWEN3_8_27B.capabilities;       // ["chat","thinking","tools","vision","code"]
QWEN3_8_27B.ollamaTag;          // "qwen3.8:27b"

recommend({ use: "coding", local: true, maxParams: "32b" });
// → Qwen3-Coder 30B-A3B   (ollama: qwen3-coder:30b)

recommend({ use: "embed" });
// → Qwen3-Embedding 8B

models.filter((m) => !m.legacy && m.capabilities.includes("vision"));
```

Every entry carries `id`, `name`, `family`, `params`, `paramCount`, `contextWindow`, `maxOutput`, `capabilities`, `thinking`, plus `ollamaTag` and `dashscopeId` where they exist.

## Client

```ts
import { Qwen, QWEN3_CODER_480B, recommend } from "qwen";

const qwen = new Qwen({
  provider: "dashscope",          // | "dashscope-cn" | "openai" | "ollama" | { baseURL, apiKey }
  model: recommend({ use: "coding", maxParams: "32b" }),
});

const answer = await qwen.say("Write a haiku about compilers");
```

### Streaming

```ts
for await (const chunk of qwen.chatStream({ messages: [{ role: "user", content: "hi" }] })) {
  if (chunk.delta.reasoningContent) process.stderr.write(chunk.delta.reasoningContent);
  if (chunk.delta.content) process.stdout.write(chunk.delta.content);
}
```

### Qwen-native knobs

```ts
await qwen.chat({
  messages,
  thinking: true,          // Qwen3 hybrid mode on
  thinkingBudget: 2048,    // cap the reasoning tokens (DashScope)
  enableSearch: true,      // DashScope web search plugin
});
```

`thinking` is mapped per provider: `enable_thinking` / `thinking_budget` on DashScope, `think` on Ollama.

### Embeddings

```ts
const { embeddings, dimensions } = await qwen.embed({ input: ["hello", "world"] });
```

Defaults to `qwen3-embedding-8b` (4096 dims locally, 100+ languages, No.1 on MTEB multilingual). DashScope resolves that model to `text-embedding-v4`, whose compatible endpoint currently supports up to 2048 dimensions; request larger dimensions only from providers that support them.

### Functional style

```ts
import { say, chat } from "qwen";

await say("summarise this", { provider: "ollama", model: "qwen3.8:27b" });
```

## Providers

| `provider` | Base URL | Credentials |
|---|---|---|
| `dashscope` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| `dashscope-cn` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| `openai` | `https://api.openai.com/v1` (or `OPENAI_BASE_URL`) | `OPENAI_API_KEY` |
| `ollama` | `http://localhost:11434` (or `OLLAMA_HOST`) | none |
| any URL | that URL, treated as OpenAI-compatible | `QWEN_API_KEY` |

Precedence: explicit options → provider-specific environment (`DASHSCOPE_HTTP_BASE_URL`, `OPENAI_BASE_URL`, `OLLAMA_HOST`) → `QWEN_BASE_URL` / `QWEN_API_KEY` fallbacks → built-in defaults. With no provider selected, `QWEN_BASE_URL` alone selects a custom OpenAI-compatible endpoint.

Requests have no built-in timeout and are not retried automatically. Pass `signal` in call options when a request must be cancellable.

### Request lifecycle and errors

- Every provider call accepts `{ signal }` through `CallOptions`.
- Caller-initiated aborts propagate as abort errors; transport and connection failures are wrapped in typed `QwenError` subclasses.
- HTTP `429` responses expose `RateLimitError.retryAfter` when the provider sends a numeric `Retry-After` header. The client does not sleep or retry automatically.
- `qwen config` masks API keys but redacts only credentials embedded in base URLs; do not paste secret-bearing URLs into shared logs.

## CLI

```bash
qwen "explain this repo"                 # one-shot, streams
qwen                                     # REPL
cat app.ts | qwen --prompt "review this" # pipe
qwen -m qwen3-coder:30b --thinking "…"   # explicit model + thinking

qwen models                              # the catalog
qwen models --local                      # what Ollama has installed
qwen recommend --use coding --local --max-params 32b
qwen pull qwen3.8:27b                    # ollama pull, with progress
qwen config                              # resolved provider + key source
```

`-j/--json` on any read command for machine-readable output, `-q/--quiet` for answer-only text.

## Model families covered

| Family | Sizes | Notes |
|---|---|---|
| `qwen3.8` | 27B, 2.4T-A95B, Max, Max-0902 | flagship generation; omni + live-translate specialists |
| `qwen3.8-flash` | 125B-A6B | **Qwen4 architecture preview** (`qwen3.8-flash-next` open weights; `qwen3.8-flash` API, 1M ctx) |
| `qwen3.7` | Max, Plus, Flash (hosted) | agent-first generation, 1M ctx; Max is text-only |
| `qwen3.6` | 27B, 35B-A3B (+ hosted Plus/Flash/Max) | agentic coding, thinking preservation |
| `qwen3.5` | 0.8B → 122B (+397B-A17B cloud; hosted Plus/Flash) | multimodal, incl. `-coding` variants |
| `qwen3-next` | 80B-A3B | parameter-efficiency focus |
| `qwen3-coder` / `-next` | 30B-A3B, 80B-A3B, 480B-A35B | 256K ctx (1M with YaRN) |
| `qwen3` | 0.6B → 235B-A22B | hybrid `/think` `/no_think` |
| `qwen3-vl` | 8B, 32B, 235B | vision-language |
| `qwen3-embedding` | 0.6B, 4B, 8B | up to 4096 dims |
| `qwq` | 32B | always-on reasoner |
| `qwen2.5*` | various | marked `legacy` |

Specs come from Qwen's published model cards and the Ollama library, checked in September 2026. The catalog is data - corrections and new releases are welcome as PRs. Provider model IDs, availability, and limits can change upstream; live provider behavior is not covered by the automated suite.

## API surface

```ts
import {
  Qwen, createClient, chat, chatStream, say,
  models, modelsById, getModel, resolveModel, requireModel, recommend, recommendAll,
  resolveProvider, createTransport,
  QwenError, AuthenticationError, RateLimitError, NotFoundError,
  QWEN3_8_27B, QWEN3_CODER_480B, QWEN3_EMBEDDING_8B, QWQ_32B,
} from "qwen";
```

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run coverage
npm run build
```

Supported runtimes are Node `^22.12.0`, `^24.0.0`, and `>=26.0.0`. CI covers Node 22, 24, and 26. Node 18 and Node 20 are end-of-life and are not supported.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and commit conventions.

## Releases

See [CHANGELOG.md](./CHANGELOG.md) for release notes. The `0.x` series may introduce breaking changes in minor releases; `1.0.0` will mark the first stable API.

## License

MIT. Qwen model names and trademarks belong to their respective owners; this project's use of them is nominative only.
