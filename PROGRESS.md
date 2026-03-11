# adev — 개발 진행 현황

> 작성일: 2026-03-12 (Batch 1 + Batch 2 완료 기준)
> 기준: `bun test` + `bun run tsc --noEmit` + `bun run biome check src/`

---

## 전체 요약

| 항목 | 수치 |
|------|------|
| 소스 파일 (src/) | **160개** `.ts` |
| 테스트 파일 (tests/) | **99개** `.ts` |
| 테스트 통과 | **205,349 pass / 0 fail** |
| expect() 호출 수 | **590,007건** |
| TypeScript 컴파일 | ✅ 오류 없음 |
| Biome 린트 | ✅ 160파일 이상 없음 |
| 소스 코드 총 라인 | ~29,153줄 |
| 테스트 코드 총 라인 | ~142,585줄 |
| 300줄 초과 파일 | ⚠️ **10개** (기술 부채) |
| 총 커밋 수 | **115개** |

---

## 테스트 결과 (최신)

```
unit:   13,038 pass / 0 fail  (81 파일)
module:  1,068 pass / 0 fail  ( 8 파일)
e2e:   191,243 pass / 0 fail  ( 8 파일)
─────────────────────────────────────────
총계:  205,349 pass / 0 fail / 0 error  (98 파일)
실행 시간: ~80–90초
```

---

## 모듈별 구현 현황

### ✅ Phase 1 — `src/core` (12파일 완료)

| 파일 | 줄수 | 설명 |
|------|-----|------|
| `config.ts` | 311 | process.env 유일 접근점. 글로벌+프로젝트 설정 병합 |
| `types.ts` | 160 | Result<T,E>, Phase FSM, AgentName 7종, VectorRepository |
| `errors.ts` | 93 | AdevError 계층 (ConfigError, AuthError, RagError 등) |
| `logger.ts` | 155 | Logger 인터페이스 + ConsoleLogger. credential 마스킹 |
| `memory.ts` | 240 | LanceDB 기반 MemoryRecord CRUD + 벡터 검색 |
| `process-executor.ts` | 259 | Bun.spawn 래퍼. 30초 타임아웃. 10MB 버퍼 제한 |
| `plugin-loader.ts` | 177 | ~/.adev/plugins/ + .adev/plugins/ 동적 로드 |
| `skill-merger.ts` | — | 스킬 SKILL.md 병합 (Batch 1 신규) |
| `skill-merger-types.ts` | — | SkillMerger 타입 분리 |
| `template-loader.ts` | — | 템플릿 파일 로드/캐시 (Batch 1 신규) |
| `template-loader-types.ts` | — | TemplateLoader 타입 분리 |
| `index.ts` | — | public re-export |

---

### ✅ Phase 2 — `src/auth` (7파일 완료)

| 파일 | 설명 |
|------|------|
| `api-key-auth.ts` | ANTHROPIC_API_KEY 기반. rate limit 헤더 파싱 |
| `subscription-auth.ts` | Bearer token. 5시간 롤링 윈도우 사용량 추적 |
| `auth-manager.ts` | env 기반 모드 선택 팩토리 |
| `oauth-expiry-checker.ts` | OAuth 토큰 만료 감지 (Batch 1 신규) |
| `oauth-expiry-types.ts` | OAuth 만료 타입 분리 |
| `types.ts` | AuthProvider 인터페이스, RateLimitStatus |
| `index.ts` | public re-export |

---

### ✅ Phase 3 — `src/rag` (18파일 완료)

**LanceDB 테이블 3개**: `code_index`, `design_decisions`, `failures`

| 파일 | 설명 |
|------|------|
| `vectorizer.ts` | 최상위 RAG API. indexer + searcher 통합 |
| `code-indexer.ts` | .ts/.js 스캔 → ChunkSplitter → EmbeddingProvider → LanceDB |
| `embeddings.ts` | TransformersEmbeddingProvider (Xenova/all-MiniLM-L6-v2, 384차원) |
| `embedding-factory.ts` | **Batch 2 신규** — 4-Provider 팩토리 (`createEmbeddingProvider`) |
| `jina-embeddings.ts` | **Batch 1 신규** — Jina AI 임베딩 Provider |
| `voyage-embeddings.ts` | **Batch 1 신규** — Voyage AI 임베딩 Provider (337줄) |
| `vector-store.ts` | LanceDB `code_index` 테이블 CRUD + 유사도 검색 |
| `vector-store-types.ts` | VectorStore 타입 분리 |
| `chunk-splitter.ts` | 오버랩 청크 분할 |
| `chunk-splitter-utils.ts` | 청크 유틸 분리 |
| `search.ts` | RagSearcher. 쿼리 임베딩 → 벡터 유사도. 기본 limit 10 |
| `design-decision-store.ts` | LanceDB `design_decisions` 테이블 |
| `design-decision-store-types.ts` | 타입 분리 |
| `failure-store.ts` | LanceDB `failures` 테이블 |
| `failure-store-types.ts` | 타입 분리 |
| `sql-utils.ts` | LanceDB SQL 필터 헬퍼 |
| `types.ts` | EmbeddingProvider 인터페이스, SearchResult |
| `index.ts` | public re-export |

**4-Provider Tier 임베딩 체계**:
```
Tier 1 (로컬): TransformersEmbeddingProvider (Xenova, 384차원)
Tier 2 (로컬): JinaEmbeddingProvider (Jina AI)
Tier 3 (API):  VoyageEmbeddingProvider (Voyage AI, 1024차원)
Tier 4 (API):  OpenAI-compatible (팩토리 주입 가능)
```

---

### ✅ Phase 4 — `src/mcp` (17파일 완료)

**빌트인 MCP 서버 4종**: `browser`, `git`, `os-control`, `web-search`

| 파일 | 설명 |
|------|------|
| `mcp-manager.ts` | Bun.spawn으로 MCP 서버 실행. 프로세스 상태 추적 |
| `mcp-handshake.ts` | JSON-RPC initialize/initialized 핸드셰이크 (10초 타임아웃) |
| `loader.ts` | ~/.adev/mcp/ + .adev/mcp/ 병합 로드 |
| `registry.ts` | in-memory 레지스트리. 중복 이름 방지 |
| `builtin/git/git-operations.ts` | Git 작업 (402줄) |
| `builtin/os-control/filesystem.ts` | 파일시스템 작업 (317줄) |
| `builtin/browser/playwright-operations.ts` | 브라우저 자동화 |
| `builtin/web-search/search-operations.ts` | 웹 검색 |

---

### ✅ Phase 5 — `src/layer1` (22파일 완료)

**파이프라인**: `Planner → Designer → SpecBuilder → TestTypeDesigner → ContractBuilder → HandoffPackage`

| 파일 | 설명 |
|------|------|
| `claude-api.ts` | @anthropic-ai/sdk 래퍼. 스트리밍/비스트리밍. 기본모델: claude-opus-4-20250514 |
| `claude-api-helpers.ts` | withRetry, handleApiError, handleStreamEvent 분리 |
| `claude-api-types.ts` | ClaudeApi 타입 분리 |
| `planner.ts` | 대화 이력 분석 → 구조화 계획서 생성 |
| `designer.ts` | 계획 + feature spec → 상세 설계 문서 |
| `spec-builder.ts` | 계획+설계+feature → 최종 스펙 (필수 섹션 검증) |
| `test-type-designer.ts` | 수용 기준 → 테스트 카테고리 매핑. edge/random 80% |
| `contract-builder.ts` | ContractSchema 생성. Kahn 위상 정렬 순환 의존 탐지 |
| `contract-builder-utils.ts` | topologicalSort, buildVerificationMatrix 분리 |
| `contract-verifier.ts` | **Batch 1 신규** — Contract 유효성 검증기 |
| `contract-verifier-types.ts` | 타입 분리 |
| `contract-change-manager.ts` | **Batch 1 신규** — Contract 변경 추적/관리 |
| `contract-change-types.ts` | 타입 분리 |
| `contract-types.ts` | ContractSchema 타입 분리 |
| `verifier.ts` | Layer1Verifier — 의도 일치 검증. pass/fail + 피드백 |
| `conversation.ts` | MemoryRepository 기반 대화 이력. 이력 50건, 컨텍스트 10건 |
| `conversation-types.ts` | ConversationMessage 타입 분리 |
| `agent-md-generator.ts` | **Batch 2 신규** — AI 기반 .adev/agents/*.md 초안 생성 |
| `agent-md-generator-instructions.ts` | **Batch 2 신규** — 7개 에이전트별 지침 |
| `feature-types.ts` | FeatureSpec, FeatureStatus 타입 분리 |
| `types.ts` | HandoffPackage, TestTypeDefinition 공유 타입 |
| `index.ts` | public re-export |

---

### ✅ Phase 6 — `src/layer2` (39파일 완료)

**4단계 FSM**: `DESIGN → CODE → TEST → VERIFY`
**7 에이전트**: `architect`, `coder`, `tester`, `qc`, `qa`, `reviewer`, `documenter`

#### 6-A: 기반 모듈
| 파일 | 설명 |
|------|------|
| `types.ts` | AgentConfig, AgentEvent, PhaseTransition, VerificationResult |
| `phase-engine.ts` | 4-Phase FSM. 전환 규칙 + 이력 추적 |
| `phase-types.ts` | Phase 타입 분리 |
| `agent-spawner.ts` | AgentExecutor 얇은 래퍼. 스폰/완료 이벤트 로깅 |
| `agent-types.ts` | AgentConfig 타입 분리 |
| `session-manager.ts` | 에이전트 세션 in-memory CRUD + 상태 전환 |
| `session-types.ts` | Session 타입 분리 |
| `token-monitor.ts` | AuthProvider 레이트 리밋 감시. 20% 쓰로틀, 5% 일시정지 |
| `token-wait-loop.ts` | **Batch 1 신규** — 토큰 한도 graceful 대기 (1분 체크, 최대 1시간) |
| `progress-tracker.ts` | feature별 진행 추적. 전체 완성율 계산 |

#### 6-B: 개발 제어
| 파일 | 설명 |
|------|------|
| `handoff-receiver.ts` | Layer1 HandoffPackage 수신 + 검증. 최소 완성도 0.8 |
| `agent-generator.ts` | 역할별 AgentConfig 생성. coder만 코드 수정 도구 보유 |
| `agent-draft-loader.ts` | **Batch 1 신규** — .adev/agents/*.md 초안 로더 |
| `agent-draft-loader-types.ts` | 타입 분리 |
| `coder-allocator.ts` | 모듈별 coder 할당. 다중 coder 파일 충돌 방지 |
| `parallel-coder-runner.ts` | **Batch 1 신규** — N개 Coder 병렬 실행 오케스트레이터 |
| `git-branch-manager.ts` | **Batch 1 신규** — feature 브랜치 생성/병합/롤백 |
| `stream-monitor.ts` | PreToolUse/PostToolUse/TeammateIdle 훅 이벤트 수집 |
| `bias-detector.ts` | 확증편향/무한루프/교착상태/범위확장 탐지 |
| `failure-handler.ts` | 실패 분류 → RecoveryAction |

#### 6-C: 검증 + 통합
| 파일 | 설명 |
|------|------|
| `verification-gate.ts` | 4계층 검증: qa_qc → reviewer → layer1 → adev |
| `verification-escalator.ts` | **Batch 1 신규** — haiku→sonnet→opus 에스컬레이션 |
| `verification-escalator-types.ts` | 타입 분리 |
| `integration-tester.ts` | unit→module→integration→e2e 계단식 Fail-Fast |
| `clean-env-manager.ts` | 통합 테스트용 격리 임시 디렉토리 |
| `user-checkpoint.ts` | 검증 후 approve/revise 체크포인트 |

#### 6-D: V2 Session API
| 파일 | 설명 |
|------|------|
| `v2-session-executor.ts` | AgentExecutor 완전 구현. send()+stream() 패턴. DESIGN Phase Agent Teams 활성화 |
| `v2-session-executor-types.ts` | V2Session 인터페이스, V2SessionFactory |
| `v2-session-factory.ts` | @anthropic-ai/claude-agent-sdk 기반. mapSdkEvent (text '\n' 조인) |
| `session-snapshot-store.ts` | **Batch 1 신규** — 세션 스냅샷 LanceDB 저장 |
| `session-snapshot-store-types.ts` | 타입 분리 |
| `session-restore-orchestrator.ts` | **Batch 1 신규** — LanceDB 스냅샷 → unstable_v2_resumeSession 복원 |

#### 6-D: 오케스트레이터
| 파일 | 설명 |
|------|------|
| `team-leader.ts` | 메인 오케스트레이터. DESIGN→CODE→TEST→VERIFY (최대 10회 반복) |
| `team-leader-helpers.ts` | executePhase, spawnDocumenter, queryRagContext 순수 함수 |
| `team-leader-types.ts` | TeamLeader 타입 분리 |
| `layer2-bootstrap.ts` | AuthProvider + Logger → 전체 Layer2 컴포넌트 인스턴스화 |
| `index.ts` | public re-export |

---

### ✅ Phase 7 — `src/layer3` (26파일 완료)

**통합 문서 8종**: API Reference, Architecture Overview, User Guide, Developer Guide, Deployment Guide, Testing Guide, Changelog, README

| 파일 | 설명 |
|------|------|
| `doc-collaborator.ts` | Layer1+Layer2 협업 문서 생성 |
| `doc-collaborator-bridge.ts` | callLayer1(), callLayer2(), runCollaborationPipeline() 추출 |
| `doc-collaborator-types.ts` | 타입 분리 |
| `deliverable-builder.ts` | 비즈니스 산출물 4종 생성 |
| `deliverable-renderer.ts` | generateDeliverableTitle, generateBusinessContent 순수 함수 |
| `deliverable-builder-types.ts` | 타입 분리 |
| `deliverable-types.ts` | Deliverable 타입 분리 |
| `production-tester.ts` | 지속적 E2E 세션 관리. 기본 5분 간격. Fail-Fast |
| `production-tester-session.ts` | executeOnce 세션 단일 실행 로직 |
| `production-tester-types.ts` | 타입 분리 |
| `doc-integrator.ts` | Layer2 조각 문서 → 8종 통합 프로젝트 문서 |
| `doc-integrator-fragment.ts` | 단편 수집/병합 헬퍼 |
| `doc-integrator-merge.ts` | integrateSync + integrateWithOptions |
| `doc-integrator-template.ts` | 템플릿 loadDefault/list/register/read |
| `doc-integrator-types.ts` | 타입 분리 |
| `doc-types.ts` | Document 공통 타입 |
| `bug-escalator.ts` | Layer3→Layer2 버그 에스컬레이션 |
| `bug-escalator-types.ts` | 타입 분리 |
| `bug-report.ts` | 순수 버그 리포트 헬퍼 |
| `bug-types.ts` | Bug 타입 분리 |
| `e2e-runner.ts` | executeE2E (Bun.spawn 비동기) + runE2E (동기 시뮬레이션) |
| `e2e-types.ts` | E2E 타입 분리 |
| `verification-runner.ts` | runVerificationStep |
| `user-confirmation.ts` | TTY 사용자 승인 프롬프트. CI 자동 승인 |
| `types.ts` | Layer3 공유 타입 |
| `index.ts` | public re-export |

---

### ✅ Phase 8 — `src/cli` (18파일 완료)

**TUI 대폭 리팩터 (Batch 1)**: chat.ts 단일 파일 → renderer/spinner/input/types 분리

| 파일 | 설명 |
|------|------|
| `main.ts` | CliApp — yargs 명령 파싱. 버전 0.0.1-alpha |
| `command-router.ts` | CliCommand 등록/이름별 라우팅 |
| `types.ts` | CliResult, CliCommand, EXIT_CODES |
| `commands/start.ts` | Layer1 전체 파이프라인 → Layer2Bootstrap → TUI (822줄) |
| `commands/auth.ts` | 인터랙티브 인증. ~/.adev/.env 저장 |
| `commands/config.ts` | 글로벌/프로젝트 config 관리 (471줄) |
| `commands/init.ts` | inquirer 프롬프트 프로젝트 초기화. isTTY 방어 처리 (531줄) |
| `commands/project.ts` | ~/.adev/projects.json 레지스트리 관리 (457줄) |
| `tui/chat.ts` | 스트리밍 REPL (469줄) |
| `tui/renderer.ts` | **Batch 1 신규** — TUI 렌더러 메인 |
| `tui/renderer-box.ts` | **Batch 1 신규** — Box 레이아웃 렌더러 |
| `tui/renderer-formatters.ts` | **Batch 1 신규** — 포맷터 유틸 |
| `tui/input.ts` | **Batch 1 신규** — 입력 처리 |
| `tui/spinner.ts` | **Batch 1 신규** — 스피너 컴포넌트 |
| `tui/types.ts` | TUI 타입 분리 |
| `tui/ansi.ts` | ANSI 색상 헬퍼 |
| `tui/index.ts` | TUI public re-export |
| `index.ts` | CLI public re-export |

---

## Batch 구현 이력

### ✅ Batch 2 (2026-03-12 완료)
- `src/layer1/agent-md-generator.ts` — AI 기반 .adev/agents/*.md 초안 생성
- `src/layer1/agent-md-generator-instructions.ts` — 7개 에이전트 지침
- `src/rag/embedding-factory.ts` — 4-Provider Embedding Factory
- `src/cli/commands/init.ts` — isTTY 방어 처리 (non-TTY hang 수정)

### ✅ Batch 1 (2026-03-11 완료)
- `src/layer2/ipc-poller.ts` + `ipc-poller-types.ts` — 디스크 IPC 폴링 (500ms)
- `src/layer2/session-snapshot-store.ts` + `session-snapshot-store-types.ts` — LanceDB 스냅샷
- `src/layer2/session-restore-orchestrator.ts` — LanceDB → unstable_v2_resumeSession
- `src/layer2/token-wait-loop.ts` — 토큰 한도 graceful 대기 (최대 1시간)
- `src/layer2/parallel-coder-runner.ts` — N개 Coder 병렬 실행
- `src/layer2/git-branch-manager.ts` — feature 브랜치 생성/병합/롤백
- `src/layer2/verification-escalator.ts` — haiku→sonnet→opus 에스컬레이션
- `src/layer2/agent-draft-loader.ts` — .adev/agents/*.md 초안 로더
- `src/auth/oauth-expiry-checker.ts` — OAuth 토큰 만료 감지
- `src/core/skill-merger.ts` — SKILL.md 병합
- `src/core/template-loader.ts` — 템플릿 파일 로드
- `src/rag/jina-embeddings.ts` — Jina AI 임베딩 Provider
- `src/rag/voyage-embeddings.ts` — Voyage AI 임베딩 Provider
- TUI 리팩터: `renderer`, `renderer-box`, `renderer-formatters`, `input`, `spinner`

### ✅ claude-common Skill 추가 (2026-03-12)
- `.claude/skills/claude-common/SKILL.md` — Anthropic JS/TS SDK 코딩 가이드라인

---

## 기술 부채

### ⚠️ 300줄 초과 파일 (10개)

| 파일 | 줄수 | 분할 방법 |
|------|-----|----------|
| `src/cli/commands/start.ts` | **822줄** | Layer1 파이프라인 호출 로직 분리 필요 |
| `src/cli/commands/init.ts` | **531줄** | init-wizard.ts, init-scaffold.ts 분리 |
| `src/cli/commands/config.ts` | **471줄** | config-reader.ts, config-writer.ts 분리 |
| `src/cli/tui/chat.ts` | **469줄** | chat-input.ts, chat-output.ts 분리 |
| `src/cli/commands/project.ts` | **457줄** | project-crud.ts, project-display.ts 분리 |
| `src/mcp/builtin/git/git-operations.ts` | **402줄** | git-read.ts, git-write.ts 분리 |
| `src/rag/voyage-embeddings.ts` | **337줄** | voyage-client.ts 분리 |
| `src/mcp/builtin/os-control/filesystem.ts` | **317줄** | fs-read.ts, fs-write.ts 분리 |
| `src/core/config.ts` | **311줄** | config-schema.ts, config-merge.ts 분리 |
| `src/layer2/team-leader.ts` | **306줄** | 추가 분리 필요 |

---

## 아키텍처 흐름

```
사용자 입력
     │
     ▼
src/index.ts          (CLI 진입점, process.exit 유일 허용)
     │
     ▼
src/cli/main.ts       (CliApp + yargs)
     │
     ├── init    → src/cli/commands/init.ts
     ├── auth    → src/cli/commands/auth.ts
     ├── config  → src/cli/commands/config.ts
     ├── project → src/cli/commands/project.ts
     └── start   → src/cli/commands/start.ts
                        │
                        ▼
               [Layer1 파이프라인]
               Planner → Designer → SpecBuilder
               → TestTypeDesigner → ContractBuilder
               → ContractVerifier → HandoffPackage
                        │
                        ▼
               [Layer2 오케스트레이션]
               TeamLeader (4단계 FSM, 최대 10회)
               ┌─ DESIGN:  architect
               ├─ CODE:    ParallelCoderRunner (coder × N)
               │             GitBranchManager (브랜치 격리)
               ├─ TEST:    tester + qc + IntegrationTester
               └─ VERIFY:  VerificationGate
                             → VerificationEscalator (haiku→sonnet→opus)
                        │
                        ▼
               [IpcPoller + TokenWaitLoop + SessionRestore]
               (IPC 폴링 500ms, 토큰 한도 감시, 세션 스냅샷 복원)
                        │
                        ▼
               [Layer3 산출물]
               DocCollaborator → DocIntegrator (8종 통합 문서)
               DeliverableBuilder (portfolio, bizplan 등)
               ProductionTester (5분 간격 E2E)
               BugEscalator (심각도 분류 → Layer2 재실행)
```

---

## 모듈 의존성 (단방향, 위반 없음)

```
cli → core, auth, layer1
layer1 → core, rag
layer2 → core, rag, layer1
layer3 → core, rag, layer2
rag → core
mcp → core
auth → core
```

순환 의존: **없음**

---

## 다음 우선 작업

1. **300줄 초과 파일 분할** (10개 → 0개) — 특히 `start.ts` (822줄), `init.ts` (531줄)
2. **E2E 실제 실행 검증** — `adev start` 명령어 실제 플로우 테스트
3. **npm publish 준비** — `bun build` dist 검증 + package.json 버전 관리

---

*생성: 2026-03-12 | 기준 커밋: `4ac2b86`*
