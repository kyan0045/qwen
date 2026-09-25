# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
for releases at or after `1.0.0`. Before `1.0.0`, minor versions may include
breaking changes.

## [0.1.0] - 2026-09-25

Initial public release.

### Added

- Typed Qwen model catalog with lookup and recommendation helpers.
- Multi-provider client for DashScope, OpenAI-compatible endpoints, and Ollama.
- Chat, streaming chat, embeddings, local-model listing, and Ollama pulls.
- Node.js CLI with one-shot prompts, stdin composition, REPL, catalog,
  recommendation, configuration, and pull commands.
- ESM and CommonJS builds with TypeScript declarations.
- Unit, provider, CLI, and packaging smoke checks.

### Compatibility

- Requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`.
- Node 18 and Node 20 are end-of-life and are not supported.

### Known limitations

- Provider calls have no built-in timeout and are not retried automatically.
  Pass an `AbortSignal` when cancellation is required.
- Live provider credentials and model availability are not covered by the
  automated suite; provider model IDs and limits can change upstream.
