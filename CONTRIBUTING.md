# Contributing

Thanks for helping out. This project keeps a small, strict workflow so releases stay boring.

## Requirements

- Node `^22.12.0`, `^24.0.0`, or `>=26.0.0` (see `engines` in `package.json`).
- npm (lockfile is committed; use `npm ci` for reproducible installs).

## Setup

```bash
npm ci
npm test
```

Git hooks are installed via the `prepare` script (`husky`). The `commit-msg`
hook lints every commit message with commitlint.

## Workflow

1. Create a focused branch for one change.
2. Add or update tests alongside behavior changes.
3. Run the checks before pushing:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
4. Open a pull request against `main` and let CI run.

## Conventional Commits

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/).

Format:

```text
<type>[(scope)]: <description>

[body]

[footer]
```

Rules enforced by commitlint (`@commitlint/config-conventional`):

- `type` is required and must be lowercase, e.g. `feat`, `fix`, `docs`,
  `test`, `refactor`, `chore`, `ci`, `build`, `perf`, `revert`.
- The description is required, imperative mood, no trailing period.
- The header should stay under ~100 characters.
- Breaking changes use `!` after the type/scope and a `BREAKING CHANGE:`
  footer explaining the migration.

Examples:

```text
feat(cli): default local chat to the Ollama provider
fix(dashscope): resolve the default embedding alias
docs: document supported Node.js versions
test(http): cover abort propagation and stream cancellation
chore(deps): bump vitest to 5.0.2
feat(api)!: rename EmbedRequest.instruction semantics
```

Suggested scopes: `cli`, `client`, `models`, `providers`, `dashscope`,
`ollama`, `openai`, `http`, `docs`, `ci`, `deps`, `release`.

Bad examples (rejected by the hook):

```text
Add stuff
fix: Fixed the bug.
WIP
feat(CLI): uppercase type
```

## Pull request checklist

- [ ] Tests added or updated for behavior changes.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass.
- [ ] Docs updated (`README.md` and/or `CHANGELOG.md`) for user-facing changes.
- [ ] No secrets, credentials, or local-only paths committed.
- [ ] Commit messages follow Conventional Commits.

## Releases

- Changes worth noting go in `CHANGELOG.md` under an `Unreleased` section.
- Version bumps follow semver; `0.x` minors may break.
- Releases are cut from GitHub Releases, which triggers the publish workflow.
