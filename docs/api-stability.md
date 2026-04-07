# API Stability — autonomous-dev-agent v1.0 Freeze List

> **Frozen as of v1.0.0 (2026-04-07)**
> Items marked **STABLE** are part of the public API contract. Breaking changes require a semver major bump.
> Items marked **INTERNAL** are implementation details and may change in any release.

---

## Subpath Exports (package.json `exports`)

| Import path                       | Status   | Notes                                       |
|-----------------------------------|----------|---------------------------------------------|
| `autonomous-dev-agent`            | STABLE   | CLI entry — `adev` binary                   |
| `autonomous-dev-agent/core`       | STABLE   | Shared types, errors, config, logger        |
| `autonomous-dev-agent/rag`        | STABLE   | Embedding, vector store, indexer, searcher  |
| `autonomous-dev-agent/layer1`     | STABLE   | Conversation, planning, design, contracts   |
| `autonomous-dev-agent/layer2`     | STABLE   | Orchestration, phase engine, session mgmt   |
| `autonomous-dev-agent/layer3`     | STABLE   | Deliverables, E2E testing, bug escalation   |

---

## `core` — Stable Public API

### Classes
| Symbol                      | Status   |
|-----------------------------|----------|
| `ConsoleLogger`             | STABLE   |
| `MemoryRepository`          | STABLE   |
| `DefaultPluginLoader`       | STABLE   |
| `PluginManager`             | STABLE   |
| `DefaultPluginContext`      | STABLE   |
| `ProcessExecutor`           | STABLE   |
| `SkillMerger`               | STABLE   |
| `TemplateLoader`            | STABLE   |
| `CircuitBreaker`            | STABLE   |
| `PerfTracker`               | STABLE   |
| `LlmRegistry`               | STABLE   |
| `ModelRouter`               | STABLE   |

### Functions
| Symbol                      | Status   |
|-----------------------------|----------|
| `ok`, `err`                 | STABLE   |
| `loadConfig`, `validateConfig`, `deepMerge`, `loadEnvironment` | STABLE |
| `maskSensitiveData`         | STABLE   |
| `safeJsonParse`, `sanitizeFilePath` | STABLE |
| `checkFileSize`, `guardAndSplitIfNeeded`, `splitLargeFile` | STABLE |
| `createMetricsEvent`        | STABLE   |

### Interfaces / Types
| Symbol                      | Status   |
|-----------------------------|----------|
| `Result<T, E>`              | STABLE   |
| `Logger`, `LogLevel`, `LogEntry` | STABLE |
| `LlmProvider`, `LlmMessage`, `LlmChatResponse`, `LlmStreamEvent` | STABLE |
| `Plugin`, `PluginLoader`, `PluginManifest` | STABLE |
| `AdevPlugin`, `PluginManifestV2`, `PluginContext` | STABLE |
| `ConfigSchema`, `EmbeddingConfig`, `ModelsConfig` | STABLE |
| `AdevError`, `AgentError`, `ConfigError`, `RagError`, `PhaseError` | STABLE |
| `VectorRepository`, `MemoryRecord`, `CodeRecord` | STABLE |
| `MetricsCollector`, `MetricsEvent` | STABLE |
| `ModelRouter`, `RoutingDecision`, `ModelReference` | STABLE |

---

## `rag` — Stable Public API

### Classes
| Symbol                      | Status   |
|-----------------------------|----------|
| `CodeVectorStore`           | STABLE   |
| `DesignDecisionRepository`  | STABLE   |
| `FailureRepository`         | STABLE   |
| `ChunkSplitter`             | STABLE   |
| `CodeIndexer`               | STABLE   |
| `RagSearcher`               | STABLE   |
| `TransformersEmbeddingProvider` | STABLE |
| `JinaEmbeddingProvider`     | STABLE   |
| `VoyageEmbeddingProvider`   | STABLE   |
| `EmbeddingFactory`          | STABLE   |
| `Vectorizer`                | STABLE   |

### Interfaces / Types
| Symbol                      | Status   |
|-----------------------------|----------|
| `EmbeddingProvider`         | STABLE   |
| `EmbeddingTier`             | STABLE   |
| `SearchResult`              | STABLE   |
| `ChunkInput`, `ChunkMetadata`, `ChunkOptions` | STABLE |

---

## `layer1` — Stable Public API

### Classes
| Symbol                      | Status   |
|-----------------------------|----------|
| `ConversationManager`       | STABLE   |
| `ConversationFsm`           | STABLE   |
| `Planner`                   | STABLE   |
| `Designer`                  | STABLE   |
| `SpecBuilder`               | STABLE   |
| `TestTypeDesigner`          | STABLE   |
| `ContractBuilder`           | STABLE   |
| `Layer1Verifier`            | STABLE   |
| `ContractVerifier`          | STABLE   |
| `ContractAiConsistencyVerifier` | STABLE |
| `AgentMdGenerator`          | STABLE   |
| `AgentMdReviewer`           | STABLE   |
| `SkillMdGenerator`          | STABLE   |
| `ClaudeApi`                 | **INTERNAL** — use `LlmProvider` from `core` instead |
| `IClaudeApi`                | **INTERNAL** — use `LlmProvider` from `core` instead |

### Interfaces / Types
| Symbol                      | Status   |
|-----------------------------|----------|
| `FeatureSpec`, `HandoffPackage`, `ContractSchema` | STABLE |
| `ConversationMessage`, `ConversationPhase` | STABLE |
| `TestTypeDefinition`, `TestCategory`, `TestRatios` | STABLE |
| `VerificationMatrix`, `Layer1VerificationResult` | STABLE |
| `ContractVerificationResult`, `ContractVerificationIssue` | STABLE |
| `AgentMdGeneratorConfig`, `AgentMdReviewInput`, `AgentReviewResult` | STABLE |
| `SkillMdGeneratorConfig`    | STABLE   |
| `ClaudeApiRequestOptions`, `ClaudeApiResponse`, `ClaudeStreamEvent` | **INTERNAL** |

---

## `layer2` — Stable Public API

### Classes
| Symbol                      | Status   |
|-----------------------------|----------|
| `PhaseEngine`               | STABLE   |
| `TeamLeader`                | STABLE   |
| `SessionManager`            | STABLE   |
| `AgentGenerator`            | STABLE   |
| `AgentSpawner`              | STABLE   |
| `CoderAllocator`            | STABLE   |
| `FailureHandler`            | STABLE   |
| `IntegrationTester`         | STABLE   |
| `ProgressTracker`           | STABLE   |
| `VerificationGate`          | STABLE   |
| `V2SessionExecutor`         | STABLE   |
| `UserCheckpoint`            | STABLE   |
| `BiasDetector`              | STABLE   |
| `ClaudeProvider`            | STABLE   |
| `OpenAiProvider`            | STABLE   |
| `StreamMonitor`             | **INTERNAL** — internal hook-event collection |
| `TokenMonitor`              | **INTERNAL** — internal rate-limit tracking |
| `CleanEnvManager`           | **INTERNAL** — internal test env lifecycle |
| `HandoffReceiver`           | **INTERNAL** — internal layer1→layer2 handoff validation |
| `DocumenterEventDispatcher` | **INTERNAL** — internal documenter trigger |

### Interfaces / Types
| Symbol                      | Status   |
|-----------------------------|----------|
| `IPhaseEngine`, `PhaseParticipants` | STABLE |
| `ITeamLeader`, `TeamLeaderDeps`     | STABLE |
| `ISessionManager`, `SessionSnapshot`, `SessionState` | STABLE |
| `IFailureHandler`, `FailureReport`, `FailureType`    | STABLE |
| `IProgressTracker`, `FeatureProgress` | STABLE |
| `IVerificationGate`, `VerificationResult`, `VerificationPhase` | STABLE |
| `AgentConfig`, `AgentExecutor`, `AgentEvent`         | STABLE |
| `PhaseTransition`, `CoderAllocation`                 | STABLE |
| `CheckpointData`, `UserDecision`                     | STABLE |
| `V2SessionExecutorOptions`  | STABLE   |
| `DocumenterEvent`, `DocumenterEventType`             | STABLE   |
| `BiasAlert`, `BiasSeverity`, `BiasType`              | STABLE   |
| `HookEvent`, `HookEventType`                         | STABLE   |

---

## `layer3` — Stable Public API

### Classes
| Symbol                      | Status   |
|-----------------------------|----------|
| `BugEscalator`              | STABLE   |
| `DeliverableBuilder`        | STABLE   |
| `DocCollaborator`           | STABLE   |
| `DocIntegrator`             | STABLE   |
| `ProductionTester`          | STABLE   |

### Interfaces / Types
| Symbol                      | Status   |
|-----------------------------|----------|
| `IBugEscalator`, `BugReport`, `BugCategory`, `BugSeverity` | STABLE |
| `IDeliverableBuilder`, `Deliverable`, `DeliverableType`    | STABLE |
| `IDocCollaborator`, `CollabDocState`, `CollabPhase`        | STABLE |
| `IDocIntegrator`, `IntegratedDocument`, `IntegrateOptions` | STABLE |
| `IProductionTester`, `ContinuousE2EConfig`, `ContinuousE2EStatus` | STABLE |
| `E2ETestRun`, `TestExecutionReport`, `TestFailure`         | STABLE |
| `BusinessDeliverable`, `DocumentTemplate`, `DocumentFragment` | STABLE |

---

## Stability Policy

- **STABLE** symbols follow [Semantic Versioning](https://semver.org/): breaking changes → major bump
- **INTERNAL** symbols may change in any patch, minor, or major release without notice
- New exports added in a minor release; nothing removed in minor/patch
- `@internal` JSDoc tag on source marks INTERNAL items for TypeDoc and IDE hints

## Not Included in Exports (file-private / never public)

The following categories of files are **not** accessible via subpath imports and are considered fully private:

- `*-helpers.ts` — utility functions local to their module
- `*-utils.ts` — utility functions local to their module
- `*-steps.ts` — step functions internal to multi-step flows
- `*-fallback.ts` — fallback implementations
- `session-restore-orchestrator*.ts` — internal session recovery
- `ipc-poller*.ts` — internal IPC polling
- `token-wait-loop.ts` — internal rate-limit wait loop
- `worker-resolver.ts` — internal worker resolution
- `git-branch-manager.ts`, `git-branch-utils.ts` — internal git workflow
- `parallel-coder-runner*.ts` — internal parallel coder management
- `team-leader-*-phase.ts` — internal phase dispatch helpers
- `verification-escalator*.ts` — internal verification escalation
- `v2-session-factory.ts`, `v2-session-env-builder.ts` — internal session setup
- All `layer3/deliverable-*-renderer.ts` — internal format renderers
