# Contributing to autonomous-dev-agent (adev)

Thank you for your interest in contributing! adev is an open-source orchestration system — your contributions help make autonomous software development more accessible and reliable.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Submitting Changes](#submitting-changes)
- [Issue Templates](#issue-templates)
- [Plugin Development](#plugin-development)

---

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

---

## How to Contribute

### Reporting Bugs

1. Search [existing issues](https://github.com/uygnoey/autonomous-dev-agent-ts/issues) to avoid duplicates.
2. Use the **Bug Report** template when opening a new issue.
3. Include: adev version, OS, Node/Bun version, reproduction steps, and expected vs actual behavior.

### Suggesting Features

1. Open an issue using the **Feature Request** template.
2. Describe the use case and why it improves the orchestration workflow.
3. For large changes, discuss in an issue before opening a PR.

### Submitting a Plugin

1. Use the **Plugin Submission** issue template to propose your plugin.
2. Follow the plugin authoring guide in `docs/plugin-authoring.md`.
3. Include at least one working example in `examples/`.

---

## Development Setup

**Prerequisites:** [Bun](https://bun.sh/) ≥ 1.3, Node.js ≥ 18 (for tooling), an Anthropic API key.

```bash
# Clone the repo
git clone https://github.com/uygnoey/autonomous-dev-agent-ts.git
cd autonomous-dev-agent-ts

# Install dependencies
bun install

# Copy env template
cp .env.example .env
# Edit .env — add ANTHROPIC_API_KEY at minimum

# Build
bun run build

# Run tests
bun test

# Lint
bunx biome check src/

# Type check
bunx tsc --noEmit
```

---

## Submitting Changes

### Branch naming

| Type | Pattern |
|------|---------|
| Feature | `feature/{short-description}` |
| Bug fix | `fix/{short-description}` |
| Docs | `docs/{short-description}` |
| Refactor | `refactor/{short-description}` |

### Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add ModelRouter engine
fix: correct Phase FSM transition guard
docs: add plugin authoring guide
test: add coverage for LanceDB repository
chore: bump bun to 1.3.1
```

### Pull Request checklist

Before opening a PR, ensure:

- [ ] `bun test` passes (no failures)
- [ ] `bunx tsc --noEmit` passes
- [ ] `bunx biome check src/` passes
- [ ] New public functions/interfaces have JSDoc
- [ ] New features have corresponding unit tests
- [ ] Tests cover edge cases (aim for ≥80% edge-case coverage per the testing guide)
- [ ] No `any` types, `console.log`, or `process.env` direct access
- [ ] Commit message follows Conventional Commits

### Review process

1. Open a PR against `main` with a clear description.
2. A maintainer will review within a few days.
3. Address review comments and push follow-up commits (do not force-push).
4. Once approved, a maintainer will merge.

---

## Issue Templates

Three templates are available when opening a new issue:

- **Bug Report** — unexpected behavior or crash
- **Feature Request** — new capability or improvement
- **Plugin Submission** — propose a community plugin

---

## Plugin Development

adev supports plugins that hook into the Phase lifecycle. See `docs/plugin-authoring.md` for the full API and `examples/plugin-hello-world/` for a minimal working example.

---

## Questions?

Open a [Discussion](https://github.com/uygnoey/autonomous-dev-agent-ts/discussions) for general questions. Reserve Issues for bugs and concrete feature requests.
