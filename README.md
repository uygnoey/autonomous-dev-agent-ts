# autonomous-dev-agent (adev)

> **Languages:** [English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [Español](README.es.md)

**Claude Code Skills + RAG-powered autonomous development agent system**

[![TypeScript](https://img.shields.io/badge/TypeScript-ESNext-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.1-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)
[![Claude SDK](https://img.shields.io/badge/Claude_Agent_SDK-V2_Session_API-cc785c?logo=anthropic&logoColor=white)](https://docs.anthropic.com/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Embedded_Vector_DB-4B8BBE)](https://lancedb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 1. Project Overview

**adev (autonomous-dev-agent)** is an intelligent agent orchestration system that combines Claude's advanced capabilities with RAG (Retrieval-Augmented Generation) to deliver consistent, high-quality autonomous software development.

Built on the Claude Agent SDK with a three-layer architecture, it manages the entire development lifecycle from requirements gathering to production-ready code with seven specialized agents working in coordinated phases.

### Key Features

- **3-Layer Architecture**: Clear separation between user dialogue (Layer1), autonomous development (Layer2), and artifact generation (Layer3)
- **7 Specialized Agents**: architect, qa, coder, tester, qc, reviewer, and documenter working in coordinated phases
- **4-Phase State Machine**: DESIGN → CODE → TEST → VERIFY workflow with FSM-based transitions
- **4-Layer Validation**: qa/qc → reviewer → Layer1 (intent validation) → adev (final judgment)
- **Fail-Fast Testing**: Stop immediately on first failure → fix → re-run from that step
- **RAG-Enhanced Memory**: LanceDB vector database for persistent context, design decisions, and failure history
- **4-Provider Embedding Tier**: Free (Xenova/Jina) + Paid (Voyage) automatic selection
- **Built-in MCP Servers**: filesystem, lancedb, memory, web-search with custom MCP support
- **Multilingual Documentation**: Automatic generation in English, Korean, Japanese, and Spanish

---

## 2. Architecture Overview

### 3-Layer Structure

```
┌───────────────────────────────────────────────┐
│ Layer 1: Claude API (Opus 4.6)               │
│ User dialogue, planning, design, validation   │
│ Modules: src/layer1/                          │
├───────────────────────────────────────────────┤
│         User "Confirm" → Contract → Layer2    │
├───────────────────────────────────────────────┤
│ Layer 2: Claude Agent SDK (V2 Session API)   │
│ ┌─────────────────────────────────────────┐   │
│ │ Layer2-A: Feature Development           │   │
│ │   adev (Team Leader)                    │   │
│ │   ├─ architect  — Design & architecture │   │
│ │   ├─ qa         — Prevention gate       │   │
│ │   ├─ coder ×N   — Code implementation   │   │
│ │   ├─ tester     — Test + Fail-fast      │   │
│ │   ├─ qc         — Detection & RCA       │   │
│ │   ├─ reviewer   — Code review           │   │
│ │   └─ documenter — Documentation         │   │
│ ├─────────────────────────────────────────┤   │
│ │ Layer2-B: Integration Verification      │   │
│ │   Cascading Fail-Fast E2E testing       │   │
│ ├─────────────────────────────────────────┤   │
│ │ Layer2-C: User Confirmation              │   │
│ └─────────────────────────────────────────┘   │
├───────────────────────────────────────────────┤
│ Layer 3: Artifacts + Continuous Verification │
│ Integrated docs, business outputs, E2E        │
│ Modules: src/layer3/                          │
└───────────────────────────────────────────────┘
```

### Module Dependency Graph

```
┌─────┐
│ cli │ ─────→ core, auth, layer1
└──┬──┘
   ↓
┌────────┐
│ layer1 │ ─→ core, rag
└────┬───┘
     ↓
┌────────┐
│ layer2 │ ─→ core, rag, layer1
└────┬───┘
     ↓
┌────────┐
│ layer3 │ ─→ core, rag, layer2
└────────┘

┌─────┐     ┌──────┐     ┌─────┐
│ rag │ ─→  │ core │  ←─ │ mcp │
└─────┘     └──────┘     └─────┘
            ↑
┌──────┐    │
│ auth │ ───┘
└──────┘
```

**Rule**: Dependencies flow in arrow direction only. No circular dependencies allowed. `core` module imports nothing.

### Key Modules

| Module | Files | Core Responsibility |
|--------|-------|---------------------|
| `core/` | 5 | config, errors, logger, memory, plugin-loader |
| `auth/` | 4 | API key / Subscription authentication |
| `cli/` | 5 | CLI commands (init, start, config, project) |
| `layer1/` | 8 | User dialogue, planning, design, contract creation |
| `layer2/` | 16 | Autonomous development orchestration |
| `layer3/` | 5 | Integrated docs, continuous E2E, business artifacts |
| `rag/` | 7 | LanceDB, embeddings, code indexing, search |
| `mcp/` | 12 | MCP server management, 4 built-in servers |

---

## 3. Installation

### Quick Install (Recommended)

**One-line install** (automatically installs Bun if needed):

```bash
curl -fsSL https://raw.githubusercontent.com/uygnoey/autonomous-dev-agent-ts/main/install.sh | bash
```

After installation:
```bash
# Restart your shell or reload PATH
source ~/.zshrc  # or ~/.bashrc

# Run adev
adev
```

### Alternative: Manual Installation

<details>
<summary>Click to expand manual installation steps</summary>

#### Prerequisites

- **Bun runtime** (≥1.1.0) - Fast JavaScript/TypeScript runtime
- **Anthropic API key** OR **Claude Pro/Max Subscription**

#### Install Bun

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

#### Clone and Setup

```bash
# Clone repository
git clone https://github.com/uygnoey/autonomous-dev-agent-ts.git
cd autonomous-dev-agent-ts

# Install dependencies
bun install

# Build
bun run build

# Optional: Add to PATH
ln -s $(pwd)/dist/index.js /usr/local/bin/adev
```

</details>

### Authentication

Choose ONE authentication method:

#### Method 1: API Key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

#### Method 2: Subscription (Pro/Max)

```bash
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

> **Note**: Only set ONE environment variable. Do not set both simultaneously.

---

## 4. Usage

### Interactive Development Session

Start an interactive development session:

```bash
# Development mode
bun run dev

# Built binary (after build)
./dist/index.js
```

In interactive mode, you can:
- Discuss project requirements and ideas
- Generate design documents and contracts
- Trigger autonomous development with 7 agents
- Review and validate outputs at each phase
- Make iterative improvements based on feedback

### CLI Commands

```bash
# Initialize project + authentication
adev init

# Start Layer1 dialogue
adev start

# View/modify configuration
adev config

# Register new project
adev project add <path>

# List registered projects
adev project list

# Switch active project
adev project switch <id>
```

### Build for Production

```bash
# Build
bun run build

# Run built binary
./dist/index.js
```

---

## 5. Testing

### Run All Tests

```bash
# Full test suite
bun test

# With coverage report
bun test --coverage
```

### Test by Category

```bash
# Unit tests only
bun run test:unit

# Module integration tests
bun run test:module

# End-to-end tests
bun run test:e2e
```

### Fail-Fast Testing Strategy

The system follows a **Fail-Fast** testing philosophy:

```
Feature Mode (Layer2-A):
  Unit 10,000 → Module 10,000 → E2E 100,000+

Integration Mode (Layer2-B) — Cascading:
  Step 1: Modified feature E2E 100,000+
  Step 2: Related features E2E 10,000 (regression)
  Step 3: Unrelated features E2E 1,000 (smoke)
  Step 4: Full integration E2E 1,000,000

Ratio: random/edge cases 80%+ · normal cases 20% max
```

**Principle**: 1 failure → immediate stop → fix → restart from that step. Never continue with failing tests.

---

## 6. API Documentation

Comprehensive documentation available in multiple languages:

- 📘 [English Documentation](docs/api/en/) - Full API reference
- 📗 [한국어 문서](docs/api/ko/) - 전체 API 레퍼런스
- 📙 [日本語ドキュメント](docs/api/ja/) - 完全なAPIリファレンス
- 📕 [Documentación en Español](docs/api/es/) - Referencia completa de API

### Key Technical Documents

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 3-layer structure, module dependencies, V2 Session API patterns |
| [SPEC.md](SPEC.md) | Complete technical specification v2.4 |
| [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md) | Phase-by-phase implementation guide |
| [AGENT-ROLES.md](docs/references/AGENT-ROLES.md) | Details of 7 specialized agents |
| [PHASE-ENGINE.md](docs/references/PHASE-ENGINE.md) | 4-Phase FSM transition rules |
| [EMBEDDING-STRATEGY.md](docs/references/EMBEDDING-STRATEGY.md) | 4-Provider tier embedding strategy |
| [V2-SESSION-API.md](docs/references/V2-SESSION-API.md) | SDK V2 Session API runtime patterns |
| [CONTRACT-SCHEMA.md](docs/references/CONTRACT-SCHEMA.md) | Contract-based HandoffPackage schema |
| [TESTING-STRATEGY.md](docs/references/TESTING-STRATEGY.md) | Fail-Fast + cascading integration verification |

---

## 7. Contributing

We welcome contributions! Please follow these guidelines:

### Code Conventions

- **ES Modules Only**: No CommonJS (`require`)
- **TypeScript Strict Mode**: No `any` types, use `unknown` + type guards
- **Result Pattern**: Use `Result<T, E>` for error handling, minimize `throw`
- **Naming Conventions**:
  - Variables/Functions: `camelCase`
  - Types/Classes/Interfaces: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Files: `kebab-case.ts`
- **File Size**: Split files exceeding 300 lines
- **Logging**: Use `src/core/logger.ts`, never `console.log`
- **Environment**: Use `src/core/config.ts`, never direct `process.env` access

### Development Workflow

1. Fork the repository
2. Create a feature branch: `feature/{feature-name}`
3. Make your changes following code conventions
4. Run quality checks: `bun run check`
5. Commit with Conventional Commits:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `refactor:` - Code refactoring
   - `test:` - Test changes
   - `chore:` - Maintenance tasks
6. Push and open a Pull Request

### Quality Gates (All Must Pass)

- [ ] TypeScript type check: `bun run typecheck`
- [ ] Linting: `bun run lint`
- [ ] All tests passing: `bun run test`
- [ ] Test coverage ≥80%
- [ ] No circular dependencies
- [ ] Documentation updated

### Pull Request Process

1. Ensure all tests pass (`bun test`)
2. Update documentation if needed
3. Follow the PR template
4. Request review from maintainers
5. Address review feedback
6. Merge after approval

### Issue Reporting

- Use issue templates for bugs and feature requests
- Include reproduction steps for bugs
- Provide context for feature requests
- Search existing issues first

---

## 8. License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## Additional Resources

### Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Runtime** | [Bun](https://bun.sh/) ≥1.1 | Package manager, bundler, test runner |
| **Language** | TypeScript (ESNext, strict) | Entire codebase |
| **Agent SDK** | [@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code) | V2 Session API based agent execution |
| **Vector DB** | [LanceDB](https://lancedb.com/) | Embedded, serverless, file-based vector DB |
| **Embedding** | [@huggingface/transformers](https://huggingface.co/docs/transformers.js) | Local embeddings (Xenova/Jina) |
| **Linter** | [Biome](https://biomejs.dev/) | Linting + formatting |

### 4-Phase Engine

Agents progress through each phase to complete features:

```
DESIGN ──(qa Gate + consensus)────→ CODE
CODE   ──(implementation done)────→ TEST
TEST   ──(0 failures + qc)────────→ VERIFY
VERIFY ──(4-layer validation)─────→ Complete
VERIFY ──(failure)────────────────→ Return to DESIGN/CODE/TEST
```

| Phase | Execution | Lead Agent | Notes |
|-------|-----------|------------|-------|
| **DESIGN** | Agent Teams (discussion) | architect | qa Gate mandatory |
| **CODE** | query() ×N parallel | coder ×N | Git branches per module |
| **TEST** | query() sequential | tester | Fail-Fast (stop on 1st failure) |
| **VERIFY** | query() sequential | adev | 4-layer validation |

### 7 Specialized Agents

| Agent | Type | Role | Code Modification |
|-------|------|------|-------------------|
| **architect** | Loop | Technical design, architecture decisions | ✗ |
| **qa** | Loop | Prevention gate — validate specs/design before coding | ✗ |
| **coder** | Loop | Code implementation (only agent with write access) | ✓ |
| **tester** | Loop | Test generation + Fail-Fast execution | Tests only |
| **qc** | Loop | Detection — root cause analysis (identify 1 cause) | ✗ |
| **reviewer** | Loop | Code review, convention/quality judgment | ✗ |
| **documenter** | Event | Spawned on phase completion → generate docs → exit | ✗ |

> **qa** is **prevention** (before coding), **qc** is **detection** (after coding). Roles are clearly separated.
> **coder** can run ×N in parallel, working on `feature/{name}-{module}-coderN` Git branches per module.

### LanceDB Tables

| Table | Purpose |
|-------|---------|
| `memory` | Conversation history, decisions, feedback, errors |
| `code_index` | Codebase chunk vector index |
| `design_decisions` | Design decision history |
| `failures` | Failure history + solutions |

### 4-Provider Embedding Tier

```
VOYAGE_API_KEY exists?
  ├─ YES → Code: voyage-code-3, Text: voyage-4-lite  (Tier 2, Paid)
  └─ NO  → Code: jina-v3,       Text: xenova-minilm  (Tier 1, Free)
```

### Development Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Run in development mode |
| `bun run build` | Build for production |
| `bun run test` | Run all tests |
| `bun run test:unit` | Unit tests only |
| `bun run test:module` | Module integration tests |
| `bun run test:e2e` | E2E tests |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Biome linting |
| `bun run format` | Biome auto-formatting |
| `bun run check` | typecheck + lint + test |

---

## Workflow Example

```
User                          adev (Layer1)                  Agents (Layer2)
 │                               │                               │
 │── "I want to build REST API" →│                               │
 │                               │── Ideas + questions ──→       │
 │←── Feedback/revisions ──      │                               │
 │                               │   (infinite loop)             │
 │── "Confirm" ──────────────→   │                               │
 │                               │── Contract creation ──→       │
 │←── Contract review ──         │                               │
 │── "Accept" ────────────────→  │                               │
 │                               │── HandoffPackage ─────────→   │
 │                               │                               │── DESIGN (team discussion)
 │                               │                               │── CODE (coder ×N parallel)
 │                               │                               │── TEST (Fail-Fast)
 │                               │                               │── VERIFY (4-layer validation)
 │                               │←── Validation results ──────  │
 │←── Results report ──          │                               │
 │                               │                               │
 │── "Confirm" ──────────────→   │── Layer3 transition ──→       │
 │                               │   Integrated docs + continuous E2E │
```

---

## Support

- 📧 Email: support@adev.example.com
- 💬 Discord: [Join our community](https://discord.gg/adev)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/autonomous-dev-agent/issues)
- 📖 Docs: [Full Documentation](https://docs.adev.example.com)

---

## Acknowledgments

- **Anthropic** - Claude API and Agent SDK
- **LanceDB** - Embedded vector database
- **Bun** - Fast JavaScript runtime
- **Community contributors** - Thank you for your contributions!

---

**Built with care by the adev team**
