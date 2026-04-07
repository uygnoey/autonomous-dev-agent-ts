# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-07

### Added

- **3-Layer Architecture**: Layer1 (user dialogue + planning), Layer2 (autonomous development orchestration), Layer3 (artifact generation + continuous verification)
- **7 Specialized Agents**: architect, qa, coder, tester, qc, reviewer, documenter — each with strict role separation
- **4-Phase State Machine**: DESIGN -> CODE -> TEST -> VERIFY workflow with FSM-based transitions and HandoffPackage protocol
- **4-Layer Validation**: qa/qc -> reviewer -> Layer1 intent validation -> adev final judgment
- **Fail-Fast Testing**: Stop on first failure, fix, re-run from that step
- **RAG-Enhanced Memory**: LanceDB vector database for persistent context, design decisions, and failure history
- **4-Provider Embedding Tier**: Free (Xenova/Jina) + Paid (Voyage) with automatic selection and fallback
- **Plugin SDK v2**: Full plugin lifecycle with install/remove/create/list CLI commands
- **Multi-Model Support**: ModelRouter engine with phase/complexity-based model selection and fallback chain
- **LLM Provider Abstraction**: Claude and OpenAI adapters with unified interface
- **Built-in MCP Servers**: filesystem, lancedb, memory, web-search, database, api-testing, deployment
- **Web Dashboard**: Real-time monitoring dashboard for agent orchestration
- **Docker Support**: Dockerfile and docker-compose.yml with headless mode
- **Circuit Breaker**: Resilience patterns for Claude API, LanceDB, and MCP connections
- **Observability**: Orchestration metrics hooks and cold-start profiling
- **Security**: MCP payload validation and input sanitizing
- **GitHub Actions CI**: Automated test, lint, and typecheck pipeline
- **Multilingual Documentation**: English, Korean, Japanese, and Spanish
- **CLI Commands**: `init`, `start`, `config`, `project`, `plugin list/install/remove/create`
- **Authentication**: API key and OAuth provider support

### Fixed

- TeamDelete race condition with exponential backoff and config cleanup callbacks
- V2SessionExecutor `resume()` session restoration and bootstrap mock
- Multiple code review findings (3 rounds: CRITICAL, HIGH, MEDIUM, LOW)
- Gap analysis issues (7 rounds, achieving 100% spec compliance)

## [0.1.0-alpha] - 2026-03-15

### Added

- Initial project scaffold with TypeScript + Bun runtime
- Core module with config, errors, logger, memory utilities
- Basic CLI structure with yargs
- LanceDB RAG integration prototype
