# adev — 스펙 대비 구현 현황 상세 분석

> 기준 스펙: `adev-spec-full-v2_4.md` (2026-03-04 확정)
> 분석 일자: 2026-03-12
> 기준 커밋: `8ffb9c6` (git pull 후)
> 테스트 결과: **204,903 pass / 3 fail** (3 fail = pdfkit 패키지 미설치)

---

## 전체 요약

| 스펙 섹션 | 구현 상태 | 비고 |
|----------|----------|------|
| §3 인증 | ✅ 완료 | API key + OAuth Subscription 모두 구현 |
| §4 설치 방식 | ✅ 완료 | install.sh, Homebrew formula, bun -g |
| §5 디렉토리 구조 | ✅ 완료 | 글로벌/프로젝트별/.adev/ 전부 구현 |
| §5.5 프로젝트 관리 | ✅ 완료 | add/remove/list/switch/update 전부 |
| §5.6 MCP 역할 | ✅ 완료 | builtin 4종 + 커스텀 로드 |
| §6 1계층 — 유저 대화 | ✅ 완료 | 전체 파이프라인 구현 |
| §6.6 테스트 유형 정의서 | ✅ 완료 | test-type-designer.ts |
| §6.7 Contract HandoffPackage | ✅ 완료 | contract-builder + verifier + change-manager |
| §6.8 1계층의 2계층 검증 참여 | ✅ 완료 | verifier.ts + layer1-verifier.ts |
| §7 에이전트 7개 | ✅ 완료 | 7개 agent.md + agent-md-generator |
| §7.3 documenter 이벤트 트리거 | ✅ 완료 | team-leader-helpers.ts spawnDocumenter |
| §8 2계층 — V2 Session API | ✅ 완료 | v2-session-executor + v2-session-factory |
| §8.4 4-Phase FSM | ✅ 완료 | phase-engine + team-leader + team-leader-phase/verify |
| §8.4 Coder×N 병렬 + Git branch | ✅ 완료 | parallel-coder-runner + git-branch-manager |
| §8.4 Hook + 디스크 IPC 감시 | ✅ 완료 | stream-monitor + ipc-poller |
| §8.4 4중 검증 | ✅ 완료 | verification-gate + verification-escalator |
| §8.5 통합 검증 (2계층-B) | ✅ 완료 | integration-tester (계단식 Fail-Fast) |
| §8.6 유저 확인 (2계층-C) | ✅ 완료 | user-checkpoint.ts |
| §9 3계층 — 산출물 + 지속 E2E | ✅ 완료 | doc-integrator + doc-collaborator + production-tester |
| §9.3 지속 E2E + 버그 에스컬레이션 | ✅ 완료 | bug-escalator.ts |
| §9 비즈니스 산출물 | ⚠️ 부분 완료 | PDF(pdfkit 미설치), PPTX/docx 미구현 |
| §10 LanceDB 스키마 4종 | ✅ 완료 | memory/code/design-decision/failure + session-snapshot |
| §11 토큰 관리 | ✅ 완료 | token-monitor + token-wait-loop + session-restore |
| §13 4-Provider Embedding | ✅ 완료 | Transformers + Jina + Voyage + Factory |

---

## §3 인증 (완료 ✅)

### 스펙 요구사항
- `ANTHROPIC_API_KEY` 또는 `CLAUDE_CODE_OAUTH_TOKEN` (동시 설정 불가)
- Subscription: 5시간 롤링 윈도우 누적 추적
- OAuth 토큰 만료 감지 (`claude setup-token` 1년 유효)

### 구현 파일
| 파일 | 스펙 항목 | 상태 |
|------|----------|------|
| `src/auth/api-key-auth.ts` | ANTHROPIC_API_KEY + rate limit 헤더 파싱 | ✅ |
| `src/auth/subscription-auth.ts` | CLAUDE_CODE_OAUTH_TOKEN + 5시간 롤링 추적 | ✅ |
| `src/auth/auth-manager.ts` | 동시 설정 불가 검증 + 팩토리 | ✅ |
| `src/auth/oauth-expiry-checker.ts` | OAuth 토큰 만료 감지 (스펙에 명시적 파일명 없음) | ✅ 추가 구현 |
| `src/auth/types.ts` | AuthProvider 인터페이스, RateLimitStatus | ✅ |

### 미구현 / 차이점
없음. 스펙 요구사항 전부 충족.

---

## §4 설치 방식 (완료 ✅)

### 스펙 요구사항
1. `curl -fsSL .../install.sh | bash`
2. `brew install autonomous-dev-agent`
3. `bun install -g autonomous-dev-agent`

### 구현 파일
| 항목 | 파일 | 상태 |
|------|------|------|
| curl one-liner | `scripts/install.sh` | ✅ |
| 삭제 스크립트 | `scripts/uninstall.sh` | ✅ |
| Homebrew formula | `scripts/brew/` | ✅ |
| bun -g | `package.json` bin 필드 + `"autonomous-dev-agent"` | ✅ |
| 버전 | `0.0.1-alpha` | ✅ |

---

## §5 디렉토리 구조 (완료 ✅)

### §5.1 프로젝트 루트 구조

스펙에서 지정한 파일명 vs 실제 구현:

| 스펙 파일명 | 실제 파일명 | 상태 |
|------------|-----------|------|
| `src/mcp/builtin/web-search/search-engine.ts` | `search-operations.ts` | ⚠️ 이름 다름 (동일 기능) |
| `src/mcp/builtin/git/git-ops.ts` | `git-operations.ts` + `git-read.ts` + `git-write.ts` | ⚠️ 이름 다름 + 분할됨 |
| `src/core/memory.ts` | `src/core/memory.ts` | ✅ |
| `src/layer1/contract-builder.ts` | `src/layer1/contract-builder.ts` | ✅ |
| `src/layer2/team-leader.ts` | `src/layer2/team-leader.ts` | ✅ |

**스펙에 없지만 구현된 파일들** (아키텍처 개선 목적):
- 모든 `*-types.ts` 파일 (타입 분리)
- `*-helpers.ts` 파일 (순수 함수 분리)
- `config-merge.ts`, `config-schema.ts` (config.ts 분할)
- `team-leader-phase.ts`, `team-leader-verify.ts` (team-leader.ts 분할)
- `integration-tester-steps.ts`, `integration-tester-helpers.ts`
- `session-restore-orchestrator-helpers.ts`
- `parallel-coder-runner-helpers.ts`
- `deliverable-writer.ts`, `deliverable-html-renderer.ts`, `deliverable-pdf-renderer.ts`

### §5.2 글로벌 디렉토리 (`~/.adev/`)

| 항목 | 구현 위치 | 상태 |
|------|----------|------|
| `~/.adev/config.json` 글로벌 설정 | `src/core/config.ts` + `config-merge.ts` | ✅ |
| `~/.adev/projects.json` | `src/cli/commands/project-registry.ts` | ✅ |
| `~/.adev/mcp/` 커스텀 MCP 로드 | `src/mcp/loader.ts` | ✅ |
| `~/.adev/skills/` 커스텀 SKILL | `src/core/skill-merger.ts` | ✅ |
| `~/.adev/templates/` 커스텀 템플릿 | `src/core/template-loader.ts` | ✅ |
| `~/.adev/data/` LanceDB (memory + code-index) | `src/core/memory.ts`, `src/rag/` | ✅ |

### §5.3 프로젝트별 디렉토리 (`.adev/`)

| 항목 | 구현 위치 | 상태 |
|------|----------|------|
| `.adev/config.json` | `src/core/config.ts` 프로젝트 설정 병합 | ✅ |
| `.adev/agents/` (7개 agent.md) | `src/layer1/agent-md-generator.ts` → `init-scaffold.ts` | ✅ |
| `.adev/sessions/` | `src/layer2/session-manager.ts` | ✅ |
| `.adev/mcp/` + `.adev/skills/` + `.adev/templates/` | `src/mcp/loader.ts`, `src/core/skill-merger.ts`, `src/core/template-loader.ts` | ✅ |
| `.adev/data/` LanceDB | `src/rag/` | ✅ |

### §5.4 설정 우선순위 (프로젝트 > 글로벌)

| 항목 | 구현 위치 | 상태 |
|------|----------|------|
| config 병합 (프로젝트 우선) | `src/core/config-merge.ts` | ✅ |
| MCP 병합 (동일 이름 → 프로젝트 우선) | `src/mcp/loader.ts` | ✅ |
| SKILL 병합 | `src/core/skill-merger.ts` | ✅ |
| templates 병합 | `src/core/template-loader.ts` | ✅ |

### §5.5 프로젝트 관리 CLI 명령어

| 명령 | 구현 파일 | 상태 |
|------|----------|------|
| `adev project add <path>` | `src/cli/commands/project-crud.ts` | ✅ |
| `adev project remove <id>` | `src/cli/commands/project-mutate.ts` | ✅ |
| `adev project list` | `src/cli/commands/project-crud-reads.ts` | ✅ |
| `adev project switch <id>` | `src/cli/commands/project-mutate.ts` | ✅ |
| `adev project update <id>` | `src/cli/commands/project-mutate.ts` | ✅ |
| projects.json CRUD | `src/cli/commands/project-registry.ts` | ✅ |
| 이름 중복 시 유저 확인 | `src/cli/commands/project-crud.ts` | ✅ |

### §5.6 MCP 역할

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| builtin os-control | `src/mcp/builtin/os-control/` (filesystem, fs-read, fs-write, process, system-info) | ✅ |
| builtin browser | `src/mcp/builtin/browser/` (chrome-control, page-reader, screenshot, playwright-operations) | ✅ |
| builtin web-search | `src/mcp/builtin/web-search/search-operations.ts` | ✅ |
| builtin git | `src/mcp/builtin/git/` (git-operations, git-read, git-write) | ✅ |
| MCP 서버 라이프사이클 관리 | `src/mcp/mcp-manager.ts` | ✅ |
| JSON-RPC initialize 핸드셰이크 | `src/mcp/mcp-handshake.ts` | ✅ |
| 글로벌+프로젝트 병합 로드 | `src/mcp/loader.ts` | ✅ |

---

## §6 1계층 — Claude API 유저 대화 (완료 ✅)

### §6.3 대화 흐름 파이프라인

```
아이디어 도출 → 기획 → 설계 → 스택 → 문서 목록
→ 테스트 케이스 유형 정의서 → 유저 "확정"
→ Contract(HandoffPackage) → 검증 → 2계층
```

| 파이프라인 단계 | 구현 파일 | 상태 |
|--------------|----------|------|
| 대화 이력 영구 저장 (LanceDB) | `src/layer1/conversation.ts` | ✅ |
| 아이디어→기획→설계 | `src/layer1/planner.ts` | ✅ |
| 설계 상세화 | `src/layer1/designer.ts` | ✅ |
| 스펙 확정본 생성 | `src/layer1/spec-builder.ts` | ✅ |
| 테스트 케이스 유형 정의서 | `src/layer1/test-type-designer.ts` | ✅ |
| Contract(HandoffPackage) 생성 | `src/layer1/contract-builder.ts` + `contract-builder-utils.ts` | ✅ |
| 기본 모델 | `claude-opus-4-20250514` (`src/layer1/claude-api.ts`) | ✅ |

### §6.6 테스트 케이스 유형 정의서

| 항목 | 구현 | 상태 |
|------|------|------|
| 카테고리 정의 (12종) | `src/layer1/test-type-designer.ts` | ✅ |
| 카테고리별 규칙/패턴/경계값 | `test-type-designer.ts` | ✅ |
| 샘플 케이스 생성 | `test-type-designer.ts` | ✅ |
| random 비중 80%+ 규칙 | `test-type-designer.ts` (기본 비율: edge/random 80%) | ✅ |
| 목표 수량 설정 (Unit 1만, Module 1만, E2E 10만+) | `contract-builder.ts` / `config.ts` | ✅ |

### §6.7 Contract 기반 HandoffPackage

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| 필수 원칙 ①~⑤ 충족 검증 | `src/layer1/contract-builder.ts` | ✅ |
| id 참조 무결성 검사 | `contract-builder-utils.ts` | ✅ |
| Kahn 위상 정렬 (순환 의존 탐지) | `contract-builder-utils.ts` (topologicalSort) | ✅ |
| 검증 매트릭스 생성 | `contract-builder-utils.ts` (buildVerificationMatrix) | ✅ |
| [구조 검증] handoff-receiver | `src/layer2/handoff-receiver.ts` | ✅ |
| [정합성 검증] architect + qa | `src/layer1/contract-verifier.ts` | ✅ |
| Contract 변경 관리 (version++ + 영향 기능 식별) | `src/layer1/contract-change-manager.ts` | ✅ |
| CLI 검증 결과 출력 (✅/⚠️ error/warning) | `src/cli/commands/start-pipeline.ts` | ✅ |
| 상세 리포트 파일 생성 | `src/layer1/contract-verifier.ts` | ✅ |

### §6.8 1계층의 2계층 검증 참여

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| 4중 검증 3번째 단계 참여 | `src/layer1/verifier.ts` | ✅ |
| layer2에서 1계층 호출 | `src/layer2/layer1-verifier.ts` | ✅ |
| 검증 모델 설정 (opus/sonnet + escalation) | `src/layer2/verification-escalator.ts` | ✅ |

### §6.9 산출물 목록

| 산출물 | 구현 위치 | 상태 |
|-------|----------|------|
| 기획서 | `planner.ts` 출력 | ✅ |
| 설계서 | `designer.ts` 출력 | ✅ |
| 필요 문서 목록 | `spec-builder.ts` 출력 | ✅ |
| 테스트 케이스 유형 정의서 | `test-type-designer.ts` 출력 | ✅ |
| 전체 스펙 확정본 | `spec-builder.ts` 출력 | ✅ |
| Contract (HandoffPackage) | `contract-builder.ts` 출력 | ✅ |

### §7.4 agent.md 자동 생성 흐름

| 단계 | 구현 파일 | 상태 |
|------|----------|------|
| Step1: 프로젝트 스펙 기반 초안 생성 | `src/layer1/agent-md-generator.ts` | ✅ |
| Step2: 7개 에이전트별 지침 | `src/layer1/agent-md-generator-instructions.ts` | ✅ |
| Step3: .adev/agents/에 저장 | `src/cli/commands/init-scaffold.ts` | ✅ |
| Step4: 2계층 spawn 시 적용 | `src/layer2/agent-draft-loader.ts` | ✅ |
| 유저 수정 → 확정 흐름 | `src/cli/commands/init-wizard.ts` | ✅ |

---

## §8 2계층 — 자율 개발 (완료 ✅)

### §8.1 V2 Session API 실행 방법

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| `unstable_v2_createSession()` | `src/layer2/v2-session-factory.ts` | ✅ |
| `session.stream()` + Hook | `src/layer2/v2-session-executor.ts` | ✅ |
| `unstable_v2_prompt()` 단발 실행 | `src/layer2/v2-session-factory.ts` (executeOneShot) | ✅ |
| SDK 이벤트 → AgentEvent 매핑 | `v2-session-factory.ts` (mapSdkEvent) | ✅ |
| AgentExecutor 추상화 | `src/layer2/v2-session-executor-types.ts` | ✅ |

### Phase별 실행 전략 (스펙 §8.1)

| Phase | 스펙 요구사항 | 구현 | 상태 |
|-------|-------------|------|------|
| DESIGN | session.stream() 1개 + Agent Teams 활성화 | `v2-session-executor.ts` DESIGN 분기 + env 설정 | ✅ |
| CODE | unstable_v2_prompt() N개 동시 (Promise.all) | `parallel-coder-runner.ts` (Promise.allSettled) | ✅ |
| TEST | unstable_v2_prompt() 순차 | `integration-tester-steps.ts` 순차 실행 | ✅ |
| VERIFY | unstable_v2_prompt() 순차 | `team-leader-verify.ts` 순차 실행 | ✅ |

### §8.3 adev 직접 제어 + 감시

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| PreToolUse / PostToolUse Hook | `src/layer2/stream-monitor.ts` | ✅ |
| TeammateIdle Hook | `src/layer2/stream-monitor.ts` | ✅ |
| 디스크 IPC 폴링 (~/.claude/teams/ + tasks/) | `src/layer2/ipc-poller.ts` | ✅ |
| 폴링 간격 500ms | `src/layer2/ipc-poller.ts` | ✅ |
| 확증편향/루프/교착/범위확장 탐지 | `src/layer2/bias-detector.ts` | ✅ |
| 이상 감지 시 세션 종료 + 재spawn | `src/layer2/team-leader.ts` (실패 복구) | ✅ |

### §8.4 4-Phase 협업 모델

#### DESIGN Phase
| 항목 | 구현 | 상태 |
|------|------|------|
| Agent Teams 활성화 (DESIGN만) | `v2-session-executor.ts` env 분기 | ✅ |
| architect/qa/coder/reviewer 참여자 | `phase-engine.ts` phaseParticipants | ✅ |
| qa Gate 통과 종료 조건 | `team-leader-phase.ts` | ✅ |
| documenter 이벤트 트리거 (설계 완료 시) | `team-leader-helpers.ts` (spawnDocumenter) | ✅ |

#### CODE Phase
| 항목 | 구현 | 상태 |
|------|------|------|
| coder×N 독립 병렬 실행 | `parallel-coder-runner.ts` (Promise.allSettled) | ✅ |
| 모듈 단위 분배 | `coder-allocator.ts` | ✅ |
| Git branch 격리 (feature/{기능명}-{모듈명}-coderN) | `git-branch-manager.ts` | ✅ |
| architect/reviewer 감독 별도 세션 | `parallel-coder-runner.ts` (supervisor 세션) | ✅ |
| coder 간 같은 파일 편집 금지 | `coder-allocator.ts` (파일 충돌 방지) | ✅ |
| merge 순서 결정 (의존성 그래프 기반) | `git-branch-manager.ts` | ✅ |
| documenter 이벤트 트리거 (코드 완료 시) | `team-leader-helpers.ts` | ✅ |

#### TEST Phase (Fail-Fast)
| 항목 | 구현 | 상태 |
|------|------|------|
| Unit → Module → E2E 계단식 실행 | `integration-tester-steps.ts` | ✅ |
| 1개 실패 → 즉시 중단 (Fail-Fast) | `integration-tester.ts` + `integration-tester-steps.ts` | ✅ |
| qc 실패 근본 원인 분석 (1개만) | `integration-tester.ts` (failure-handler 연동) | ✅ |
| coder 수정 → 해당 단계 처음부터 재실행 | `team-leader-phase.ts` | ✅ |
| 통합 E2E 계단식 Fail-Fast (Step1~4) | `integration-tester-steps.ts` | ✅ |
| documenter 이벤트 트리거 (테스트 완료/실패 시) | `team-leader-helpers.ts` | ✅ |

#### VERIFY Phase (4중 검증)
| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| ① qa/qc: 스펙 준수 + 테스트 통과 검증 | `verification-gate.ts` | ✅ |
| ② reviewer: 코드 품질 + 디자인 패턴 | `verification-gate.ts` | ✅ |
| ③ 1계층 Claude API: 의도 기반 검증 | `layer1-verifier.ts` | ✅ |
| ④ adev: 종합 판단 + 확증편향 체크 | `team-leader-verify.ts` | ✅ |
| 검증 모델 설정 (Opus 기본 / Sonnet + escalation) | `verification-escalator.ts` | ✅ |
| haiku → sonnet → opus 에스컬레이션 | `verification-escalator.ts` | ✅ |
| 실패 시 적절한 Phase 복귀 | `failure-handler.ts` + `team-leader.ts` | ✅ |

### §8.4 테스트 수량 설정 (`parallel_workers: "auto"`)

| 항목 | 구현 | 상태 |
|------|------|------|
| unit_count / module_count / e2e_count 설정 | `src/core/config.ts` | ✅ |
| parallel_workers: "auto" | `src/core/config.ts` | ✅ |
| 메모리 80% 초과 시 자동 축소 | `src/layer2/token-monitor.ts` (리소스 감시) | ✅ |

### §8.5 통합 검증 (2계층-B)

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| 클린 환경 격리 (임시 디렉토리) | `src/layer2/clean-env-manager.ts` | ✅ |
| Step1: 기능별 E2E 10만+ | `integration-tester-steps.ts` step1 | ✅ |
| Step2: 연관 기능 E2E 1만 (회귀) | `integration-tester-steps.ts` step2 | ✅ |
| Step3: 비연관 기능 E2E 1천 (스모크) | `integration-tester-steps.ts` step3 | ✅ |
| Step4: 통합 E2E 100만회 최종 | `integration-tester-steps.ts` step4 | ✅ |
| 각 Step 실패 → 즉시 중단 → 해당 Step 처음부터 | `integration-tester.ts` Fail-Fast | ✅ |

### §8.6 유저 확인 (2계층-C)

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| 결과물 + 테스트 결과서 전달 | `src/layer2/user-checkpoint.ts` | ✅ |
| 수정 → 2계층-A 복귀 | `user-checkpoint.ts` + `team-leader.ts` | ✅ |
| 확정 → 3계층 진입 | `user-checkpoint.ts` | ✅ |

---

## §9 3계층 — 산출물 + 지속 검증 (부분 완료 ⚠️)

### §9.1 통합 문서 생성 (프로젝트 문서 8종)

| 문서 종류 | 구현 | 상태 |
|---------|------|------|
| README (.md) | `doc-integrator.ts` 통합 | ✅ |
| 전체 API 문서 (.md / .html) | `doc-integrator.ts` | ✅ |
| 전체 아키텍처 문서 (.md) | `doc-integrator.ts` | ✅ |
| 프로젝트 사용 설명서 (.md / .pdf) | `doc-integrator.ts` + `deliverable-pdf-renderer.ts` | ⚠️ PDF: pdfkit 미설치 |
| 설치/배포 가이드 (.md) | `doc-integrator.ts` | ✅ |
| 전체 테스트 결과 통합 리포트 (.md / .pdf) | `doc-integrator.ts` | ✅ (pdf 제외) |
| 전체 CHANGELOG 정리본 (.md) | `doc-integrator.ts` | ✅ |
| 기여 가이드 (.md) | `doc-integrator.ts` | ✅ |

### §9.1 비즈니스 산출물 (기본 4종)

| 산출물 | 스펙 포맷 | 구현 | 상태 |
|-------|---------|------|------|
| 포트폴리오 | .pdf / .pptx | `deliverable-builder.ts` → HTML fallback | ⚠️ PDF: pdfkit 미설치, PPTX: 미구현 |
| 사업계획서 / 제안서 | .pdf / .docx | `deliverable-builder.ts` → markdown | ⚠️ PDF/docx: 미완성 |
| 투자제안서 | .pdf / .pptx | `deliverable-builder.ts` → markdown | ⚠️ PDF/PPTX: 미완성 |
| PPTX 발표자료 | .pptx | 미구현 (HTML로 대체, 코드 주석 확인) | ❌ |
| HTML 렌더러 | .html | `deliverable-html-renderer.ts` | ✅ |
| PDF 렌더러 | .pdf | `deliverable-pdf-renderer.ts` (pdfkit 필요) | ⚠️ pdfkit 미설치 |

> **pdfkit 상황**: `package.json`에 의존성 명시되어 있으나 `bun install`이 미실행되어 node_modules에 없음 → 테스트 3 fail 원인

### §9.2 문서 생성 협업 방법

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| 1계층 뼈대 생성 | `src/layer3/doc-collaborator.ts` | ✅ |
| 2계층 documenter 상세 채워넣기 | `src/layer3/doc-collaborator-bridge.ts` (callLayer2) | ✅ |
| 1계층 최종 검토 + 다듬기 | `doc-collaborator.ts` (callLayer1) | ✅ |

### §9.3 지속 E2E 검증

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| 지속적 E2E 실행 (기본 5분 간격) | `src/layer3/production-tester.ts` | ✅ |
| Fail-Fast 적용 | `production-tester.ts` | ✅ |
| 단일 실행 세션 | `production-tester-session.ts` | ✅ |

### §9.4 3계층 → 2계층 버그 에스컬레이션

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| 버그 심각도 분류 | `src/layer3/bug-escalator.ts` | ✅ |
| 2계층 전체 루프 재실행 트리거 | `bug-escalator.ts` + `bug-report.ts` | ✅ |
| 계단식 통합 검증 후 3계층 복귀 | `bug-escalator.ts` | ✅ |

---

## §10 데이터 공유 — LanceDB 스키마 (완료 ✅)

| 스펙 스키마 | 구현 파일 | 상태 |
|------------|----------|------|
| `MemoryRecord` (대화 이력) | `src/core/memory.ts` | ✅ |
| `CodeRecord` (코드 인덱스) | `src/rag/vector-store.ts` | ✅ |
| `DesignDecision` (설계 결정 이력) | `src/rag/design-decision-store.ts` | ✅ |
| `FailureRecord` (실패 이력) | `src/rag/failure-store.ts` | ✅ |
| `SessionSnapshot` (세션 상태 — 스펙에 없지만 추가) | `src/layer2/session-snapshot-store.ts` | ✅ 추가 구현 |

---

## §11 토큰 관리 (완료 ✅)

### §11.1 인증 방식별 감지

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| API key: rate limit 헤더 파싱 (`anthropic-ratelimit-*`) | `src/auth/api-key-auth.ts` | ✅ |
| API key: 429 수신 시 retry-after 처리 | `src/auth/api-key-auth.ts` | ✅ |
| Subscription: response.usage 누적 추적 | `src/auth/subscription-auth.ts` | ✅ |
| Subscription: 5시간 롤링 윈도우 | `src/auth/subscription-auth.ts` | ✅ |
| Subscription: 401 에러 → 토큰 만료 안내 | `src/layer2/token-monitor.ts` | ✅ |

### §11.2 adev 토큰 관리 전략

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| remaining 20% 이하 → 새 세션 억제 | `src/layer2/token-monitor.ts` (쓰로틀) | ✅ |
| remaining 5% 이하 → graceful 완료만 허용 | `src/layer2/token-monitor.ts` (일시정지) | ✅ |
| token-wait-loop (1분 체크, 최대 1시간 대기) | `src/layer2/token-wait-loop.ts` | ✅ |

### §11.3 세션 복원 흐름

| 항목 | 구현 파일 | 상태 |
|------|----------|------|
| 세션 상태 LanceDB 스냅샷 저장 | `src/layer2/session-snapshot-store.ts` | ✅ |
| LanceDB 스냅샷 → unstable_v2_resumeSession 복원 | `src/layer2/session-restore-orchestrator.ts` | ✅ |
| 복원 실패 시 새 세션 + 벡터 컨텍스트 복원 | `session-restore-orchestrator-helpers.ts` | ✅ |

---

## §13 기술 스택 (완료 ✅)

### LanceDB

| 항목 | 구현 | 상태 |
|------|------|------|
| @lancedb/lancedb 설치 | `package.json` | ✅ |
| 테이블 4종 (memory, code_index, design_decisions, failures) | `src/rag/`, `src/core/memory.ts` | ✅ |
| 벡터 유사도 검색 | `src/rag/vector-store.ts`, `src/rag/search.ts` | ✅ |
| SQL 필터링 | `src/rag/sql-utils.ts` | ✅ |

### Claude Agent SDK V2

| 항목 | 구현 | 상태 |
|------|------|------|
| @anthropic-ai/claude-agent-sdk@0.2.72 | `package.json` | ✅ |
| unstable_v2_createSession() | `src/layer2/v2-session-factory.ts` | ✅ |
| session.stream() + Hook | `src/layer2/v2-session-executor.ts` | ✅ |
| unstable_v2_prompt() 단발 | `src/layer2/v2-session-factory.ts` (executeOneShot) | ✅ |
| DESIGN Phase만 Agent Teams 활성화 | `v2-session-executor.ts` Phase 분기 | ✅ |
| settingSources: [] (파일시스템 설정 의존 없음) | `v2-session-factory.ts` | ✅ |
| permissionMode: 'bypassPermissions' | `v2-session-factory.ts` | ✅ |

### 4-Provider Embedding Tier

| Tier | 제공자 | 구현 파일 | 상태 |
|------|--------|----------|------|
| 1-무료 | Xenova all-MiniLM-L6-v2 (@huggingface/transformers v3) | `src/rag/embeddings.ts` | ✅ |
| 1-무료 | Jina v3 로컬 | `src/rag/jina-embeddings.ts` | ✅ |
| 2-유료 | Voyage voyage-3-lite | `src/rag/voyage-embeddings.ts` | ✅ |
| 2-유료 | Voyage voyage-code-3 | `src/rag/voyage-embeddings.ts` | ✅ |
| Factory (동적 선택) | createEmbeddingProvider() | `src/rag/embedding-factory.ts` | ✅ |
| 별도 Voyage 클라이언트 | `src/rag/voyage-client.ts` | ✅ 추가 구현 |

---

## 현재 테스트 현황

```
unit:   13,048 pass / 0 fail  (81 파일)
module:  1,068 pass / 0 fail  ( 8 파일)
e2e:   190,787 pass / 3 fail  ( 8 파일)  ← pdfkit 원인
─────────────────────────────────────────────────────
총계:  204,903 pass / 3 fail / 3 errors  (98 파일)
       590,007 expect() calls
```

### 실패 원인 (3 fail)
```
error: Cannot find package 'pdfkit'
  from 'src/layer3/deliverable-pdf-renderer.ts'
```
- **원인**: `pdfkit`이 `package.json`에 선언되어 있으나 `bun install`로 미설치
- **영향 파일**: `deliverable-pdf-renderer.ts`
- **수정 방법**: `bun install` 실행 → 즉시 해결

---

## 스펙 대비 미구현 / 부족 항목

### ❌ 미구현

| 항목 | 스펙 위치 | 비고 |
|------|----------|------|
| PPTX (.pptx) 렌더러 | §9.1 비즈니스 산출물 | HTML로 fallback 중. 코드 주석: "docx/pptx는 아직 미지원" |
| docx (.docx) 렌더러 | §9.1 사업계획서/투자제안서 | HTML로 fallback 중 |
| 7명 teammate 동시 PoC | §16 PoC 검증 | "7명 미검증, 추후 확인 필요" (5명만 확인) |

### ⚠️ 부분 구현 / 이슈

| 항목 | 상태 | 해결책 |
|------|------|--------|
| PDF 렌더러 (`pdfkit`) | 패키지 선언은 됨, 미설치 | `bun install` 실행 |
| MCP 파일명 스펙 불일치 | `search-engine.ts` → `search-operations.ts`, `git-ops.ts` → `git-operations.ts` | 기능은 동일, 이름만 다름 |
| 실제 `adev start` E2E 플로우 검증 | 시뮬레이션 형태로만 테스트됨 | 실제 Claude API 호출 필요 |

### ✅ 스펙에 없지만 추가 구현된 것 (아키텍처 개선)

| 항목 | 파일 | 이유 |
|------|------|------|
| OAuth 만료 감지 | `oauth-expiry-checker.ts` | Issue #28827 대응 |
| Voyage API 분리 클라이언트 | `voyage-client.ts` | voyage-embeddings.ts 300줄 초과 분할 |
| Contract 검증기 분리 | `contract-verifier.ts` | 검증 로직 독립 모듈화 |
| Contract 변경 관리 | `contract-change-manager.ts` | 버전 관리 + 회귀 테스트 트리거 |
| 세션 스냅샷 저장 | `session-snapshot-store.ts` | 토큰 한도 복원 지원 |
| Verification Escalator | `verification-escalator.ts` | haiku→sonnet→opus 에스컬레이션 |
| Layer1 Verifier (layer2 측) | `layer1-verifier.ts` | 4중 검증 3번째 단계 layer2 구현 |
| Agent Draft Loader | `agent-draft-loader.ts` | agent.md 초안 로드 |
| Skill Merger | `skill-merger.ts` | SKILL.md 병합 |
| Template Loader | `template-loader.ts` | 문서 템플릿 캐시 로드 |
| IPC Poller | `ipc-poller.ts` | 디스크 IPC 500ms 폴링 |
| Parallel Coder Runner | `parallel-coder-runner.ts` | Coder×N Promise.allSettled |
| Git Branch Manager | `git-branch-manager.ts` | feature 브랜치 생성/병합/롤백 |
| 모든 `*-types.ts` 파일 | — | 타입 분리 (파일 300줄 제한 준수) |

---

## 전체 소스 파일 현황 (201개)

```
src/auth/        7파일
src/cli/        41파일  (commands 25, tui 13, 기타 3)
src/core/       14파일
src/layer1/     22파일
src/layer2/     39파일
src/layer3/     26파일
src/mcp/        17파일  (builtin 11, 기타 6)
src/rag/        18파일
src/index.ts     1파일
──────────────────
합계            201파일  (~32,681줄)
```

---

## 다음 우선 작업

1. **`bun install`** → pdfkit 설치 → 3 fail 해결 (즉시)
2. **PPTX/docx 렌더러 구현** → `src/layer3/deliverable-pptx-renderer.ts` (스펙 §9.1 완성)
3. **7명 teammate 동시 PoC** → 5명 검증 완료, 7명 미검증 (스펙 §16)
4. **실제 E2E 플로우 검증** → `adev start` 실제 Claude API 연동 테스트

---

*분석 완료: 2026-03-12 | 소스 201파일 / 테스트 98파일 / 스펙 v2.4 전체 대조*
