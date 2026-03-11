# Contributing to adev

Welcome! This guide explains how to contribute to the `autonomous-dev-agent` project.

---

## Prerequisites

- **Bun ≥ 1.1.0** — Runtime, bundler, and test runner
- **Git** — Version control
- **Anthropic API key** — For integration testing

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
bun --version  # should be ≥1.1.0
```

---

## Setup

```bash
# 1. Fork and clone
git clone https://github.com/uygnoey/autonomous-dev-agent-ts.git
cd autonomous-dev-agent-ts

# 2. Install dependencies
bun install

# 3. Set up environment
cp .env.example .env
# Edit .env: add ANTHROPIC_API_KEY

# 4. Run tests to verify setup
bun test
```

---

## Project Structure

```
src/
├── cli/         CLI commands (init, start, config, project)
├── core/        Shared utilities (config, errors, logger, memory)
├── auth/        Authentication (API key, OAuth)
├── layer1/      User dialogue, planning, design, contract creation
├── layer2/      Autonomous development orchestration
├── layer3/      Artifact generation, continuous E2E
├── rag/         LanceDB, embeddings, code indexing, search
└── mcp/         MCP server management

tests/
├── unit/        Unit tests (per module)
├── module/      Module integration tests
└── e2e/         End-to-end tests
```

---

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/{feature-name}   # new feature
git checkout -b fix/{bug-name}           # bug fix
git checkout -b refactor/{target}        # refactoring
```

### 2. Make Changes

Follow the [Code Conventions](#code-conventions) below.

### 3. Run Quality Checks

All checks must pass before committing:

```bash
# Type check
bunx tsc --noEmit

# Lint
bunx biome check src/

# Format (auto-fix)
bunx biome format src/ --write

# Tests
bun test
```

Or run all at once:

```bash
bun run check
```

### 4. Commit

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add voyage-3-lite embedding provider"
git commit -m "fix: handle null session in v2-session-factory"
git commit -m "docs: update embedding tier reference"
git commit -m "refactor: split voyage-embeddings into sub-batch handler"
git commit -m "test: add edge cases for batch size boundary"
git commit -m "chore: update bun lockfile"
```

**Commit prefix guide**:

| Prefix | When to use |
|--------|-------------|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code restructuring, no behavior change |
| `test:` | Test additions or fixes |
| `chore:` | Build, CI, dependency updates |
| `perf:` | Performance improvement |

### 5. Open a Pull Request

Push your branch and open a PR on GitHub. Use the PR template.

---

## Code Conventions

### TypeScript

- **ES Modules only** — no `require()`, no CommonJS
- **Strict mode** — `strict: true`, `noUncheckedIndexedAccess: true`
- **No `any`** — use `unknown` + type guards
- **No `!` non-null assertions** — use optional chaining and nullish coalescing
- **File names**: `kebab-case.ts`
- **File size**: ≤ 300 lines. Split if exceeded.

```typescript
// ✅ Good
const value: unknown = getConfig('key');
if (typeof value === 'string') {
  doSomething(value);
}

// ❌ Bad
const value: any = getConfig('key');
doSomething(value as string);
```

### Naming

| Item | Convention | Example |
|------|-----------|---------|
| Variables, functions | `camelCase` | `embeddingProvider` |
| Types, classes, interfaces | `PascalCase` | `EmbeddingProvider` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_BATCH_SIZE` |
| Files | `kebab-case.ts` | `voyage-embeddings.ts` |

### Error Handling

Use the `Result<T, E>` pattern — minimize `throw`:

```typescript
import { ok, err } from 'core/types.js';
import type { Result } from 'core/types.js';
import { RagError } from 'core/errors.js';

async function embed(texts: string[]): Promise<Result<Float32Array[]>> {
  try {
    const vectors = await callApi(texts);
    return ok(vectors);
  } catch (error: unknown) {
    return err(new RagError('rag_embedding_error', String(error), error));
  }
}

// Caller:
const result = await provider.embed(texts);
if (!result.ok) {
  logger.error('embed failed', { error: result.error.message });
  return err(result.error);
}
const vectors = result.value; // safe to use
```

### Logging

Never use `console.log`. Use the project logger:

```typescript
// ✅ Good
import type { Logger } from 'core/logger.js';

class MyClass {
  private readonly logger: Logger;
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'my-class' });
  }
  doSomething() {
    this.logger.debug('Starting operation', { param: value });
  }
}

// ❌ Bad
console.log('Starting operation', value);
```

### Environment Variables

Never access `process.env` directly. Use `src/core/config.ts`:

```typescript
// ✅ Good
import { getConfig } from 'core/config.js';
const apiKey = getConfig().voyageApiKey;

// ❌ Bad
const apiKey = process.env.VOYAGE_API_KEY;
```

### Module Dependencies

Dependencies flow in one direction only:

```
cli → core, auth, layer1
layer1 → core, rag
layer2 → core, rag, layer1
layer3 → core, rag, layer2
rag → core
mcp → core
auth → core
```

**No circular dependencies.** Verify with:

```bash
bunx madge --circular --extensions ts src/
```

---

## Testing

### Framework

Use **Bun's built-in test runner** (`bun:test`). Never use Jest or Vitest.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
```

### File locations

```
tests/unit/{module}/{file}.test.ts      # unit tests
tests/module/{name}.test.ts            # module integration
tests/e2e/{scenario}.test.ts           # end-to-end
```

### Test structure (Arrange-Act-Assert)

```typescript
describe('VoyageEmbeddingProvider', () => {
  describe('embed()', () => {
    it('빈 배열 입력 시 빈 결과 반환 / returns empty array for empty input', async () => {
      // Arrange
      const provider = new VoyageEmbeddingProvider(mockLogger, 'test-key');

      // Act
      const result = await provider.embed([]);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });
});
```

### Test ratios

| Type | Ratio |
|------|-------|
| Random / edge cases | ≥ 80% |
| Normal / happy path | ≤ 20% |

### Fail-Fast (mandatory)

1 test fails → stop immediately → fix → restart from beginning of current phase.

**Never** run all tests, collect failures, and fix them all at once.

### Forbidden patterns

- `test.skip` — no skipped tests in committed code
- `test.todo` — no placeholder tests
- `setTimeout` / `sleep` — no time-based test dependencies
- Snapshot tests — too brittle

---

## Documentation

### Bilingual comments

All source code comments must be bilingual (Korean + English):

```typescript
/**
 * 텍스트 배치를 벡터로 변환 / Batch embed texts to vectors
 *
 * @param texts - 임베딩할 텍스트 배열 / Array of texts to embed
 * @returns 정규화된 Float32Array 배열 / Array of normalized Float32Arrays
 */
async embed(texts: string[]): Promise<Result<Float32Array[]>> {
  // WHY: 빈 배열은 즉시 반환 — API 호출 불필요 / empty array returns immediately — no API call needed
  if (texts.length === 0) return ok([]);
  ...
}
```

### JSDoc requirements

All exported functions, classes, and interfaces must have JSDoc:

```typescript
/**
 * Short description (bilingual)
 *
 * @description
 * KR: 한국어 상세 설명
 * EN: English detailed description
 *
 * @param paramName - 설명 / description
 * @returns 반환값 설명 / return value description
 * @example
 * const result = myFunction('input');
 */
```

### Inline comments

Inline comments explain **WHY**, not WHAT or HOW (the code shows that):

```typescript
// ✅ WHY: 배치 128개 제한 — Voyage API 제약 준수 / batch limit 128 — Voyage API constraint
for (let offset = 0; offset < texts.length; offset += VOYAGE_BATCH_LIMIT) {
  ...
}

// ❌ HOW (redundant — code already shows this)
// iterate through texts in chunks of 128
```

---

## Quality Gates

All must pass before merging:

- [ ] `bunx tsc --noEmit` — TypeScript type check (zero errors)
- [ ] `bunx biome check src/` — Linting (zero warnings/errors)
- [ ] `bun test` — All tests pass
- [ ] No circular dependencies (`bunx madge --circular --extensions ts src/`)
- [ ] No `any` types
- [ ] No `console.log`
- [ ] All exports have JSDoc
- [ ] Test edge case ratio ≥ 80%
- [ ] Documentation updated if public API changed

---

## Reporting Issues

When filing a bug report, include:

1. **adev version**: `adev --version`
2. **Bun version**: `bun --version`
3. **OS and version**
4. **Reproduction steps** (minimal example)
5. **Expected vs actual behavior**
6. **Logs** (run with `--verbose`)

---

## Related Documents

- [COMMANDS.md](./COMMANDS.md) — CLI command reference
- [CONFIGURATION.md](./CONFIGURATION.md) — Full configuration reference
- [AGENTS.md](./AGENTS.md) — Agent roles and behavior
- [ARCHITECTURE.md](../ARCHITECTURE.md) — System architecture
- [SPEC.md](../SPEC.md) — Technical specification v2.4
