# Architect 갭 분석 리포트
## 분석 일시: 2026-03-26
## 기준 문서: adev-spec-full-v2_4.md (v2.4)

---

### 1. 미구현 (MISSING) — 스펙에 있으나 코드 없음

| 카테고리 | 기능/모듈 | 스펙 위치 | 비고 |
|---------|---------|---------|-----|
| CLI | `adev auth` 명령어 (토큰 갱신/상태 확인) | §3.2 | `src/cli/commands/auth.ts` 존재하나 스펙 §3.2의 `claude setup-token` 연동 및 토큰 만료 안내 흐름 미구현 가능성 |
| 설치 | curl one-liner `install.sh` 내용 완전성 | §4 | `scripts/install.sh` 존재. Homebrew formula (`scripts/brew/`) 존재. 실제 배포 인프라(npm publish, brew tap) 미구축 |
| Layer1 | 대화 중 LanceDB 영구 저장 (모든 대화) | §6.2, §6.3 | `conversation.ts`에 EmbeddingProvider 주입 시 벡터 저장 구현됨. 그러나 **실제 CLI → Layer1 대화 루프 통합**이 end-to-end로 완성되었는지 미확인 |
| Layer2 | DESIGN Phase Agent Teams 실제 연동 | §8.1, §8.4 | `V2SessionExecutor`에서 Agent Teams env 설정 구현됨. 그러나 **실제 `session.stream()` + teammate spawn + SendMessage 토론 오케스트레이션**은 team-leader-design-phase.ts 수준에서 SDK 호출 통합 미검증 |
| Layer2 | 실시간 architect/reviewer 감독 세션 (CODE Phase) | §8.4 | `parallel-coder-supervision.ts` 존재. 그러나 architect/reviewer가 coder와 **별도 세션으로** 실시간 감독하는 패턴이 end-to-end 완성인지 미확인 |
| Layer2 | Contract 변경 관리 (`contract-change-manager.ts`) | §6.7 | `contract-change-manager.ts` 존재. version 증가, 변경 사유 기록, 영향 기능 식별, 회귀 테스트 트리거 등 **전체 흐름 통합** 미확인 |
| Layer3 | 비즈니스 산출물 실제 파일 렌더링 (PDF/PPTX/DOCX) | §9.1 | `deliverable-pdf-renderer.ts`, `deliverable-pptx-renderer.ts`, `deliverable-docx-renderer.ts` 존재. 실제 라이브러리 의존성(pdfkit, pptxgenjs 등) 연동 및 렌더링 품질 미검증 |
| 통합 | CLI → Layer1 → Layer2 → Layer3 전체 end-to-end 파이프라인 | §14 | `start-pipeline.ts`, `start-execution.ts` 등 존재. 전체 흐름이 실제 SDK 호출과 함께 동작하는지 end-to-end 통합 테스트 부재 |
| 다중 프로젝트 | `~/.adev/` 글로벌 디렉토리 자동 생성 | §5.2 | `init-scaffold.ts`에서 `.adev/` 생성. `~/.adev/` 글로벌 디렉토리 생성은 init 명령어에 포함된 것으로 보이나 `projects.json` 관리 완전성 미확인 |

### 2. 미흡 (PARTIAL) — 구현됐으나 스펙과 차이

| 카테고리 | 기능/모듈 | 스펙 요구사항 | 현재 상태 | 차이점 |
|---------|---------|------------|---------|-------|
| RAG/Embedding | 4-Provider Tier 전환 로직 | §13 임베딩: Tier1-무료(Transformers, Jina), Tier2-유료(Voyage-lite, Voyage-code) | `embeddings.ts`(Transformers), `jina-embeddings.ts`(Jina), `voyage-embeddings.ts`(Voyage), `openai-embeddings.ts`(OpenAI) 구현됨. `embedding-factory.ts` 존재 | OpenAI provider는 스펙에 없는 추가 구현. **Voyage `voyage-3-lite` vs `voyage-code-3` 자동 전환 로직** 미확인. Tier 우선순위 자동 fallback 로직 미확인 |
| Token Monitor | Subscription 모드 5시간 롤링 윈도우 | §11.1, §11.2 | `token-monitor.ts`에서 AuthProvider 위임으로 레이트 리밋 추적 | **5시간 롤링 윈도우, Pro/Max 메시지 추정**, 7일 롤링 캡 등 세부 추적 로직이 `subscription-auth.ts` 내부에 완전 구현되었는지 미확인 |
| Session Restore | 세션 복원 흐름 | §11.3 | `session-restore-orchestrator.ts`, `session-snapshot-store.ts` 구현됨 | **SDK 세션 재개(`sessionId`) 실패 시 새 세션 + RAG 벡터 복원** 경로가 fallback 파일에 구현. 실제 SDK resume 호환성 미검증 |
| Phase Engine | Phase 전환 시 documenter 이벤트 트리거 | §7.3, §8.4 | `documenter-event-dispatcher.ts` 구현됨. `team-leader-phase.ts`에서 `spawnDocumenterOnPhaseBoundary` 호출 | documenter spawn이 **모든 이벤트 유형**(기능 완료, 테스트 완료/실패, 버그 발생, Phase 경계)에서 트리거되는지 미확인. 스펙은 5가지 이벤트 모두 요구 |
| Verification Gate | 4중 검증 모델 전략 (Opus/Sonnet 에스컬레이션) | §6.8 | `verification-gate.ts` + `verification-escalator.ts` 구현됨 | **`opus_escalation_on_failure` 설정에 따른 Sonnet→Opus 에스컬레이션** 로직이 escalator에 구현. 실제 Claude API 호출과의 연동 미검증 |
| Integration Tester | 계단식 Fail-Fast 4단계 테스트 | §8.5 | `integration-tester.ts` + `integration-tester-steps.ts` 구현됨 | 테스트 수량(10만+, 1만, 1천, 100만) 설정이 config 연동되는지, **실제 `bun test` 호출 + 결과 파싱**이 대규모에서 동작하는지 미검증 |
| Agent Generator | agent.md + SKILL.md 초안 생성 → 유저 검토 → 확정 | §7.4 | `agent-md-generator.ts`, `skill-md-generator.ts`, `agent-md-reviewer.ts` 구현됨 | **유저 검토 UI/UX 흐름**(TUI에서 초안 표시 → 유저 수정 → 확정)이 CLI와 통합되었는지 미확인 |
| MCP | 유저 커스텀 MCP 로드 + 프로젝트>글로벌 우선순위 | §5.6 | `mcp-manager.ts`에서 `initialize(globalDir, projectDir)` 패턴 | 글로벌 + 프로젝트별 MCP 동시 로드 + **동일 이름 프로젝트 우선** 병합 로직의 완전성 미확인 |
| Config | 설정 우선순위 (프로젝트 > 글로벌) | §5.4 | `config-merge.ts` 구현됨 | MCP/SKILL/config/templates 각각의 병합 규칙이 스펙대로 구현되었는지 세부 검증 필요 |
| Layer2 Bootstrap | Layer2 전체 초기화 + 의존성 조립 | — | `layer2-bootstrap.ts` 존재 | 모든 Layer2 컴포넌트(TeamLeader, PhaseEngine, AgentSpawner, StreamMonitor, BiasDetector, TokenMonitor, IntegrationTester 등)가 올바르게 조립되는지 미확인 |
| TUI | Chat 스트리밍 UI | — | `src/cli/tui/` 하위 chat-input/output/streaming/types 등 구현됨 | Layer1 대화 스트리밍과의 실제 연동 미확인 |

### 3. 완료 (DONE) — 스펙 충족

| 카테고리 | 기능/모듈 |
|---------|---------|
| Core | `config.ts` — 환경변수 경유, 하드코딩 금지 |
| Core | `errors.ts` — AdevError 계층, Result 패턴 |
| Core | `logger.ts` — 구조화 로깅 (console.log 금지) |
| Core | `memory.ts` — MemoryRepository (LanceDB 기반) |
| Core | `plugin-loader.ts` — 커스텀 모듈 로드 |
| Core | `config-merge.ts` — 설정 병합 |
| Core | `config-schema.ts` — 설정 스키마 검증 |
| Core | `file-size-guard.ts` — 100MB 파일 제한 |
| Core | `process-executor.ts` — 프로세스 실행 추상화 |
| Core | `skill-merger.ts` — Skill 병합 |
| Core | `template-loader.ts` — 템플릿 로드 |
| Auth | `api-key-auth.ts` — ANTHROPIC_API_KEY 인증 + rate limit 헤더 파싱 |
| Auth | `subscription-auth.ts` — CLAUDE_CODE_OAUTH_TOKEN 인증 + 누적 추적 |
| Auth | `auth-manager.ts` — 인증 방식 분기 |
| Auth | `oauth-expiry-checker.ts` — OAuth 토큰 만료 체크 |
| CLI | `init.ts` — 프로젝트 초기화 (위저드 + 스캐폴딩) |
| CLI | `config.ts` — 설정 CRUD |
| CLI | `project.ts` — 프로젝트 CRUD (add/remove/list/switch/update) |
| CLI | `start.ts` — 자율 개발 시작 |
| CLI | `status.ts` — 진행 상태 조회 |
| CLI | `main.ts` — CLI 진입점 (yargs) |
| CLI/TUI | `chat.ts`, `chat-input.ts`, `chat-output.ts`, `chat-streaming.ts` — TUI 채팅 UI |
| CLI/TUI | `renderer.ts`, `renderer-box.ts`, `spinner.ts`, `input.ts` — TUI 컴포넌트 |
| Layer1 | `conversation.ts` — 대화 관리 + 모호성 감지 + LanceDB 벡터 저장 |
| Layer1 | `conversation-fsm.ts` — 대화 Phase FSM (IDEA→PLANNING→...→CONTRACT) |
| Layer1 | `planner.ts` — 기획 |
| Layer1 | `designer.ts` — 설계 |
| Layer1 | `spec-builder.ts` — 스펙 빌더 |
| Layer1 | `test-type-designer.ts` — 테스트 유형 정의서 생성 |
| Layer1 | `contract-builder.ts` — Contract(HandoffPackage) 생성 + 5대 원칙 검증 |
| Layer1 | `contract-verifier.ts` — 구조 검증 + 정합성 검증 |
| Layer1 | `contract-change-manager.ts` — Contract 변경 관리 |
| Layer1 | `claude-api.ts` — Claude Messages API 래퍼 (스트리밍/비스트리밍) |
| Layer1 | `agent-md-generator.ts` — 에이전트 .md 초안 생성 |
| Layer1 | `agent-md-reviewer.ts` — 에이전트 .md 유저 검토 |
| Layer1 | `skill-md-generator.ts` — SKILL.md 자동 생성 |
| Layer1 | `verifier.ts` — 4중 검증 중 1계층 참여 |
| Layer2 | `team-leader.ts` — 메인 오케스트레이터 (4-Phase 루프) |
| Layer2 | `phase-engine.ts` — 4-Phase FSM (DESIGN→CODE→TEST→VERIFY) |
| Layer2 | `agent-spawner.ts` — 에이전트 스폰/재개 |
| Layer2 | `agent-generator.ts` — 에이전트 설정 생성 |
| Layer2 | `v2-session-executor.ts` — V2 Session API 기반 AgentExecutor |
| Layer2 | `session-manager.ts` — 세션 생명주기 관리 |
| Layer2 | `token-monitor.ts` — 토큰 사용량 추적 + 인증별 분기 |
| Layer2 | `progress-tracker.ts` — 기능별/Phase별 진행률 |
| Layer2 | `failure-handler.ts` — 실패 유형 분류 + 복구 |
| Layer2 | `handoff-receiver.ts` — Contract 수신 + 구조/정합성 검증 |
| Layer2 | `coder-allocator.ts` — Coder×N 분배 |
| Layer2 | `stream-monitor.ts` — Hook 감시 + 이상 패턴 탐지 |
| Layer2 | `bias-detector.ts` — 확증편향/루프/교착/범위이탈 탐지 |
| Layer2 | `ipc-poller.ts` — 디스크 IPC 폴링 (~/.claude/teams/ + tasks/) |
| Layer2 | `integration-tester.ts` — 4단계 계단식 Fail-Fast 통합 테스트 |
| Layer2 | `clean-env-manager.ts` — 클린 환경 생성/삭제 |
| Layer2 | `user-checkpoint.ts` — 유저 확인 흐름 (2계층-C) |
| Layer2 | `verification-gate.ts` — 4중 검증 종합 판단 |
| Layer2 | `verification-escalator.ts` — Opus/Sonnet 에스컬레이션 |
| Layer2 | `git-branch-manager.ts` — Git branch 전략 관리 |
| Layer2 | `parallel-coder-runner.ts` — Coder×N 병렬 실행 |
| Layer2 | `parallel-coder-supervision.ts` — architect/reviewer 감독 |
| Layer2 | `documenter-event-dispatcher.ts` — documenter 이벤트 트리거 |
| Layer2 | `session-restore-orchestrator.ts` — 세션 복원 |
| Layer2 | `session-snapshot-store.ts` — 세션 스냅샷 LanceDB 저장 |
| Layer2 | `layer1-verifier.ts` — Layer1 의도 기반 검증 |
| Layer2 | `token-wait-loop.ts` — 토큰 리셋 대기 루프 |
| Layer2 | `agent-draft-loader.ts` — 에이전트 .md 로드 |
| Layer3 | `doc-integrator.ts` — 조각 문서 → 통합 문서 (8개 유형) |
| Layer3 | `doc-collaborator.ts` — 1계층+2계층 협업 문서 생성 |
| Layer3 | `production-tester.ts` — 지속 E2E 실행 |
| Layer3 | `bug-escalator.ts` — 3계층→2계층 버그 리포트 |
| Layer3 | `deliverable-builder.ts` — 비즈니스 산출물 생성 (4개 유형) |
| Layer3 | `user-confirmation.ts` — 유저 재확인 |
| Layer3 | `verification-runner.ts` — 계단식 통합 검증 |
| Layer3 | `e2e-runner.ts` — E2E 테스트 실행기 |
| RAG | `vector-store.ts` — CodeVectorStore (LanceDB) |
| RAG | `design-decision-store.ts` — DesignDecisionRepository (LanceDB) |
| RAG | `failure-store.ts` — FailureRepository (LanceDB) |
| RAG | `embeddings.ts` — TransformersEmbeddingProvider (all-MiniLM-L6-v2) |
| RAG | `jina-embeddings.ts` — JinaEmbeddingProvider |
| RAG | `voyage-embeddings.ts` — VoyageEmbeddingProvider |
| RAG | `openai-embeddings.ts` — OpenAIEmbeddingProvider (스펙 외 추가) |
| RAG | `embedding-factory.ts` — Provider 팩토리 |
| RAG | `code-indexer.ts` — 코드베이스 벡터 인덱싱 |
| RAG | `search.ts` — 벡터 검색 |
| RAG | `chunk-splitter.ts` — 텍스트 청킹 |
| RAG | `vectorizer.ts` — 벡터화 |
| MCP | `mcp-manager.ts` — MCP 서버 라이프사이클 관리 |
| MCP | `registry.ts` — MCP 서버 레지스트리 |
| MCP | `loader.ts` — MCP 로더 |
| MCP | `mcp-handshake.ts` — JSON-RPC 핸드셰이크 |
| MCP/builtin | `os-control/` — 파일시스템, 프로세스, 시스템 정보 |
| MCP/builtin | `browser/` — Chrome 제어, 페이지 읽기, 스크린샷, Playwright |
| MCP/builtin | `web-search/` — 웹 검색 |
| MCP/builtin | `git/` — Git 읽기/쓰기 오퍼레이션 |
| Scripts | `install.sh`, `uninstall.sh`, `brew/` — 설치/삭제 스크립트 |
| Tests | 단위 테스트 106개, 모듈 테스트 8개, E2E 테스트 8개 파일 |

### 4. 아키텍처 구조 이슈

#### 4.1 순환 의존성 의심 지점
- 현재 코드에서 명시적 순환 의존성은 발견되지 않음
- `layer2/layer1-verifier.ts`가 `layer1/verifier.ts`를 import하는데, 이는 스펙에서 허용하는 `layer2 → layer1` 의존성 방향
- 단, **layer3 → layer2 → layer1** 간접 의존 체인이 길어 향후 순환 위험 존재 (특히 `bug-escalator.ts`가 `team-leader.ts`를 직접 import)

#### 4.2 모듈 경계 위반 사항
- `layer3/bug-escalator.ts`가 `layer2/team-leader.ts`를 직접 import → 스펙 허용 범위 (`layer3 → layer2`) 내이나, **TeamLeader 전체를 직접 참조**하는 것은 과도한 결합
- `layer3/doc-collaborator.ts`가 `layer2/agent-spawner.ts`를 직접 import → 마찬가지로 스펙 허용이나 결합도 높음
- 권장: 인터페이스를 통한 의존성 역전 적용

#### 4.3 계층 분리 문제
- `src/cli/layer2-runner.ts` — CLI 레이어에서 Layer2 직접 실행하는 브릿지. 역할 분리상 `layer1`을 거쳐야 하나, start 명령어에서 직접 layer2로 점프하는 경로가 존재
- `src/layer1/claude-api.ts`가 `@anthropic-ai/sdk`를 직접 import — 이는 의도적 설계이나, auth 모듈과의 역할 중복 가능성

#### 4.4 파일 크기 이슈
- `src/layer2/` 디렉토리에 50+ 파일 — 스펙 기준(16개)보다 상당히 많음
- 분할 자체는 300줄 규칙 준수를 위해 적절하나, 타입/헬퍼 파일의 과도한 분리로 탐색 어려움 발생 가능

### 5. 우선순위 권고

#### HIGH (핵심 기능 동작에 직결)

| # | 항목 | 사유 |
|---|------|------|
| H1 | **CLI → Layer1 → Layer2 → Layer3 end-to-end 통합 테스트** | 개별 모듈은 구현되었으나 전체 파이프라인이 실제로 동작하는지 검증 없음. 이것이 가장 큰 갭 |
| H2 | **DESIGN Phase Agent Teams 실제 SDK 연동 검증** | `V2SessionExecutor`에서 env 설정은 되나 실제 teammate spawn + SendMessage 토론이 SDK와 동작하는지 미검증 |
| H3 | **Layer2 Bootstrap 전체 의존성 조립 + 스모크 테스트** | 모든 컴포넌트가 올바르게 조립되어 TeamLeader.executeFeature()가 실행 가능한지 확인 필요 |
| H4 | **세션 복원 흐름 실제 SDK 호환 검증** | `session-restore-orchestrator.ts`의 SDK resume + RAG fallback 경로가 실제 동작하는지 미검증 |

#### MEDIUM (기능 완성도 향상)

| # | 항목 | 사유 |
|---|------|------|
| M1 | 4-Provider Tier 자동 fallback 로직 검증 | Tier1→Tier2 자동 전환, voyage-3-lite vs voyage-code-3 선택 로직 |
| M2 | Subscription 모드 세부 추적 (5시간 윈도우, Pro/Max 추정) | 현재 누적 추적은 구현되나 정밀한 윈도우 계산 미확인 |
| M3 | documenter 이벤트 5종 전체 트리거 검증 | 기능 완료, 테스트 완료/실패, 버그 발생, Phase 경계 모두 커버하는지 |
| M4 | agent.md 유저 검토 TUI 흐름 통합 | 초안 생성 + 유저 수정 + 확정의 UX가 CLI와 통합되었는지 |
| M5 | Contract 변경 관리 end-to-end | version 증가, 영향 기능 식별, 회귀 테스트 트리거 전체 흐름 |
| M6 | 비즈니스 산출물 렌더링 품질 (PDF/PPTX/DOCX) | 렌더러 코드 존재하나 실제 출력 품질 미검증 |
| M7 | Layer3 → Layer2 결합도 개선 (인터페이스 역전) | bug-escalator, doc-collaborator의 직접 import를 인터페이스로 교체 |

#### LOW (개선 사항)

| # | 항목 | 사유 |
|---|------|------|
| L1 | 배포 인프라 (npm publish, brew tap, curl installer) | 기능 구현과 무관. 배포 준비 단계에서 처리 |
| L2 | OpenAI EmbeddingProvider (스펙 외 추가) 정리 또는 문서화 | 스펙에 없는 provider. 유지할지 제거할지 결정 필요 |
| L3 | Layer2 파일 50+ → 모듈 하위 디렉토리 정리 | 탐색성 개선. 기능 영향 없음 |
| L4 | 모듈 테스트/E2E 테스트 커버리지 확대 | 현재 unit 106, module 8, e2e 8. module/e2e 대폭 보강 필요 |

---

### 6. 종합 평가

**구현 완성도**: ~85% (모듈별 코드 존재 기준)

**실제 동작 확신도**: ~40% (end-to-end 통합 미검증)

스펙에 정의된 거의 모든 모듈과 클래스가 `src/`에 구현되어 있다. 인터페이스 정의, 타입 시스템, 에러 처리 패턴, 의존성 주입 구조 모두 스펙을 충실히 따르고 있다.

그러나 **가장 큰 갭은 통합 수준**이다:
1. 개별 모듈은 단위 테스트로 검증되었으나, **전체 파이프라인**(CLI → Layer1 대화 → Contract → Layer2 자율 개발 → Layer3 산출물)이 end-to-end로 동작하는지 검증되지 않았다.
2. **실제 Claude Agent SDK 호출**과의 연동이 mock 기반 테스트에 머물러 있을 가능성이 높다.
3. **대규모 테스트 실행**(10만+ E2E)의 실현 가능성이 검증되지 않았다.

권고: H1~H4를 우선 해결하여 "실제로 동작하는 최소 파이프라인"을 확보한 후, MEDIUM/LOW 항목을 순차 보강할 것.
