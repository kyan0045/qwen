# qwen

[![npm version](https://img.shields.io/npm/v/qwen.svg)](https://www.npmjs.com/package/qwen) [![npm downloads](https://img.shields.io/npm/dm/qwen.svg)](https://www.npmjs.com/package/qwen) [![CI](https://github.com/kyan0045/qwen/actions/workflows/ci.yml/badge.svg)](https://github.com/kyan0045/qwen/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/github/license/kyan0045/qwen.svg)](https://github.com/kyan0045/qwen/blob/main/LICENSE)

**Unofficial** TypeScript toolkit for [Qwen](https://qwenlm.github.io/) models: a typed model catalog, a multi-provider client (DashScope / OpenAI-compatible / local Ollama), and a fast CLI.

Zero runtime dependencies. Requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`.

---

## Why

Three things nobody else on npm combines:

1. **A typed model catalog with `recommend()`.** The naming is genuinely hard to follow: `qwen3.5:27b`, `qwen3.6:27b` and `qwen3.8:27b` are different models, `qwen3-coder:30b` is a 30B-A3B MoE, and the bare `qwen` repo on Ollama is still **Qwen 1.5**. This package knows all of that.
2. **One interface, three backends:** Alibaba Cloud Model Studio (DashScope), any OpenAI-compatible host, and local Ollama.
3. **Qwen-native semantics:** hybrid thinking mode, thinking budgets, and DashScope's `enable_search` instead of a generic OpenAI shim.

For the full DashScope surface (images, speech, fine-tunes, assistants) use Alibaba's own [`dashscope-sdk-official`](https://www.npmjs.com/package/dashscope-sdk-official). For an agentic coding CLI see [`@qwen-code/qwen-code`](https://www.npmjs.com/package/@qwen-code/qwen-code). This package is the layer in between.

## Install

```bash
npm install qwen
# Pick the backend you want. DashScope is the default, so create
# a key in the Alibaba Cloud Model Studio console, then:
export DASHSCOPE_API_KEY="sk-..."
# Any OpenAI-compatible host serving Qwen models instead:
export QWEN_BASE_URL="https://my-host/v1"
export QWEN_API_KEY="sk-..."
# No key needed for local Ollama:
npx qwen -l "explain quantum tunnelling to a 12 year old"
# or run the default provider directly
npx qwen "explain quantum tunnelling to a 12 year old"
```

Run `qwen config` at any time to check which provider and key source are active.

## The catalog

```ts
import { QWEN3_8_27B, QWEN3_CODER_480B, recommend, models } from "qwen";

QWEN3_8_27B.contextWindow;      // 262144
QWEN3_8_27B.capabilities;       // ["chat","thinking","tools","vision","code"]
QWEN3_8_27B.ollamaTag;          // "qwen3.8:27b"
QWEN3_8_27B.openrouterId;       // "qwen/qwen3.8-27b"

recommend({ use: "coding", local: true, maxParams: "32b" });
// → Qwen3-Coder 30B-A3B   (ollama: qwen3-coder:30b)

recommend({ use: "embed" });
// → Qwen3-Embedding 8B

`maxParams` accepts plain numbers or strings like `"32b"` and `"2.4t"`.
Negative or unparseable values throw, as do negative or non-finite `minContext` values.

models.filter((m) => !m.legacy && m.capabilities.includes("vision"));
```

Every entry carries `id`, `name`, `family`, `contextWindow`, `maxOutput`, `capabilities` and `thinking`. `params`, `paramCount`, `ollamaTag`, `dashscopeId`, `openrouterId`, `embeddingDimensions`, `legacy`, `preview` and `cloudOnly` are present where they exist.

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

`thinking` is mapped per provider: `enable_thinking` / `thinking_budget` on DashScope, `think` on Ollama. Generic OpenAI-compatible hosts ignore `thinking`, `thinkingBudget` and `enableSearch` unless their `mapRequestBody` handles them. A bare `thinkingBudget` implies thinking on; `thinkingBudget` is dropped when thinking is off.

### Embeddings

```ts
const { embeddings, dimensions } = await qwen.embed({ input: ["hello", "world"] });
```

Defaults to the Qwen3-Embedding 8B entry (4096 dims, 100+ languages, No.1 on MTEB multilingual). The wire id varies per provider: `qwen3-embedding:8b` on Ollama, `text-embedding-v4` on DashScope, `qwen3-embedding-8b` elsewhere. DashScope's compatible endpoint currently supports up to 2048 dimensions; request larger dimensions only from providers that support them. Passing a chat model to `embed()` throws; a client constructed with a chat model falls back to the default instead.

### Functional style

```ts
import { say, chat } from "qwen";

await say("summarise this", { provider: "ollama", model: "qwen3.8:27b" });
```

## Providers

| `provider` | Base URL | Key variable |
|---|---|---|
| `dashscope` (default, international) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| `dashscope-cn` (China endpoint) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| `openai` (compatible protocol, still Qwen models) | `QWEN_BASE_URL` (required) | `QWEN_API_KEY` |
| `ollama` | `http://localhost:11434` (or `OLLAMA_HOST`) | none needed |
| any URL | that URL, treated as OpenAI-compatible | `QWEN_API_KEY` |

All providers request Qwen models. The `openai` name refers to the protocol only: it has no default endpoint, so point it at a host that serves Qwen via `QWEN_BASE_URL` (or pass `baseURL` in code).

### OpenRouter

Point `QWEN_BASE_URL` at `https://openrouter.ai/api/v1` and catalog IDs resolve automatically: each entry's `openrouterId` is used when the endpoint host is `openrouter.ai`, so `QWEN_BASE_URL=https://openrouter.ai/api/v1 qwen -m qwen3-coder-30b` sends `qwen/qwen3-coder-30b-a3b-instruct`. Mapped IDs are canonical rolling IDs, plus pinned dated snapshots where noted (for example `qwen/qwen3.8-max-0902`); no `:free` variants. Unknown strings pass through verbatim, and the no-model default is `qwen/qwen3-coder-plus`. A known catalog entry without a mapping for the endpoint throws instead of sending an invalid id.

### Credentials: where to put your key

There are two places a key can come from. Use one or the other:

```bash
# 1. Environment variable (the only option for the CLI:
#    there is no --api-key flag, and .env files are not autoloaded)
export DASHSCOPE_API_KEY="sk-..."   # dashscope / dashscope-cn
export QWEN_API_KEY="sk-..."        # spare key for any provider, or auth for a custom URL
# Ollama needs no key.
```

```ts
// 2. In code (overrides the environment)
new Qwen({ provider: "dashscope", apiKey: "sk-..." }); // reads DASHSCOPE_API_KEY when omitted
```

Two fallback rules cover the rest:

- `QWEN_API_KEY` works as a spare key for any provider. The provider's own variable (`DASHSCOPE_API_KEY` for DashScope) wins if both are set, and an `apiKey` passed in code wins over both.
- Custom endpoints work the same way: `DASHSCOPE_HTTP_BASE_URL` overrides the DashScope endpoint (for a proxy or mirror) and `OLLAMA_HOST` sets the Ollama daemon address, while `QWEN_BASE_URL` works for any of them. With no provider selected, setting `QWEN_BASE_URL` alone uses that URL as an OpenAI-compatible endpoint. `QWEN_PROVIDER` sets the default provider.

Requests are not retried automatically. Pass `signal` in call options when a request must be cancellable, or `timeoutMs` (also on `QwenOptions`) to abort after a delay; timeout aborts surface as `ConnectionError`.

### Request lifecycle and errors

- Every provider call accepts `{ signal, timeoutMs }` through `CallOptions`.
- Caller-initiated aborts propagate as abort errors; transport and connection failures are wrapped in typed `QwenError` subclasses.
- HTTP `429` responses expose `RateLimitError.retryAfter` when the provider sends a numeric `Retry-After` header. The client does not sleep or retry automatically.
- `qwen config` masks API keys but redacts only credentials embedded in base URLs; do not paste secret-bearing URLs into shared logs.

## CLI

```bash
qwen "explain this repo"                 # one-shot, streams (default provider: DashScope)
qwen -p ollama "explain this repo"       # same, but local Ollama
qwen -l "explain this repo"              # shorthand for --provider ollama
qwen -m qwen3-coder-30b "explain this"   # catalog id; on OpenRouter sends qwen/qwen3-coder-30b-a3b-instruct
qwen                                     # REPL
cat app.ts | qwen --prompt "review this" # pipe
qwen -m qwen3-coder:30b --thinking "…"   # explicit model + thinking

qwen models                              # the catalog
qwen models --local                      # installed Ollama models (qwen*/qwq* tags only)
qwen recommend --use coding --local --max-params 32b
qwen pull qwen3.8:27b                    # ollama pull, with progress (requires Ollama)
qwen config                              # resolved provider + key source
```

Provider selection: `-p/--provider` wins, then `-l/--local` (means Ollama), then `QWEN_PROVIDER`, then the DashScope default. If a chat fails with an auth error, run `qwen config` to see which provider was resolved and where the key came from. In the REPL, type `/help` for commands (`/model`, `/thinking`, `/system`, `/clear`, `/exit`).

### Thinking and search flags

```bash
qwen --thinking "explain this"              # force thinking on
qwen --no-thinking "explain this"           # force thinking off
qwen --thinking --thinking-budget 512 "…"   # cap reasoning tokens
qwen --enable-search "latest Qwen news"     # DashScope web search
```

A bare `--thinking-budget` implies thinking on, so it is sent with thinking enabled. `--thinking-budget` is only sent when thinking is enabled, and combining `--no-thinking` with `--thinking-budget` is rejected. When no prompt is given these flags carry over into the REPL.

`-j/--json` on `models`, `recommend`, `config` and chat for machine-readable output, `-q/--quiet` for answer-only text on stdout (the stderr stats line still prints). After each streamed answer the CLI prints the sent model id with token counts and speed (`[qwen3-coder-plus · prompt 123 · completion 45 · 15.0 tokens/s · 3.0s total]`) to stderr; `--json` responses carry `usage` in the payload instead.

## Model families covered

| Family | Sizes | Notes |
|---|---|---|
| `qwen3.8` | 27B, 2.4T-A95B, Max, Max-0902 | flagship generation; omni specialist |
| `qwen3.8-flash` | 125B-A6B | **Qwen4 architecture preview** (`qwen3.8-flash-next` open weights; `qwen3.8-flash` API, 1M ctx) |
| `qwen3.7` | Max, Plus, Flash (hosted) | agent-first generation, 1M ctx; Max is text-only |
| `qwen3.6` | 27B, 35B-A3B (+ hosted Plus/Flash/Max Preview) | agentic coding, thinking preservation |
| `qwen3.5` | 0.8B → 122B (+397B-A17B cloud; hosted Plus/Flash) | multimodal, incl. `-coding` variants |
| `qwen3-next` | 80B-A3B | parameter-efficiency focus |
| `qwen3-coder` (incl. `-next`) | 30B-A3B, 80B-A3B, 480B-A35B | 256K ctx (1M with YaRN) |
| `qwen3` | 0.6B → 235B-A22B | hybrid thinking on/off |
| `qwen3-vl` | 8B, 32B, 235B | vision-language |
| `qwen3-embedding` | 0.6B, 4B, 8B | up to 4096 dims |
| `qwq` | 32B | always-on reasoner |
| `qwen2.5*` | various | older generation (`legacy`, except hosted Turbo/Plus/Max which are `cloudOnly`) |

Specs come from Qwen's published model cards and the Ollama library, checked in September 2026. Bare `max`/`plus`/`flash` IDs float to the latest checkpoint; prefer the dated IDs (such as `qwen3.8-max-0902`) when reproducibility matters. Omni output limits are provisional, so verify them against the upstream model page. The catalog is data: corrections and new releases are welcome as PRs. Provider model IDs, availability, and limits can change upstream; live provider behavior is not covered by the automated suite.

## API surface

```ts
import {
  Qwen, createClient, chat, chatStream, say, sayStream, embed,
  resolveModelName,
  models, modelsById, getModel, resolveModel, requireModel, recommend, recommendAll,
  resolveProvider, createTransport, defaultModelFor, isOpenRouterEndpoint,
  QwenError, AuthenticationError, RateLimitError, NotFoundError,
  QWEN3_8_27B, QWEN3_CODER_480B, QWEN3_EMBEDDING_8B, QWQ_32B,
} from "qwen";
import type {
  QwenOptions, CallOptions, RecommendOptions, ChatRequest, Message,
  ModelRef, ModelRefLike,
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
