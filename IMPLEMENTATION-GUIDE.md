# adev — 구현 가이드

## 구현 원칙

- 각 Phase 완료 시 `bun test tests/unit/{모듈}/` 전부 통과 확인
- 인터페이스 정의 → 구현 → 테스트 순서 엄수
- 모듈 의존성 방향 준수 (ARCHITECTURE.md 참조)
- Result<T, E> 패턴 일관 적용 (`.claude/skills/code-quality/references/result-pattern.md`)

## Phase 1: core 모듈 (의존성 없음)

구현 순서:
1. `src/core/errors.ts` — AdevError 기반 에러 계층. ConfigError, AuthError, LayerError, RagError, AgentError 등
2. `src/core/types.ts` — Result<T,E>, Phase, AgentName, FeatureStatus 등 공유 타입
3. `src/core/config.ts` — process.env 접근의 유일한 진입점. 글로벌+프로젝트 설정 병합. ConfigSchema 검증
4. `src/core/logger.ts` — console.log 대체. 구조화된 로깅. level: debug/info/warn/error
5. `src/core/memory.ts` — LanceDB 메모리 repository. MemoryRecord CRUD + 벡터 검색
6. `src/core/plugin-loader.ts` — `~/.adev/` 커스텀 모듈 동적 로드

테스트: `tests/unit/core/` 에 각 파일별 테스트

### types.ts 핵심 타입

```typescript
// Result 패턴
type Result<T, E = AdevError> = { ok: true; value: T } | { ok: false; error: E };

// Phase 상태
type Phase = 'DESIGN' | 'CODE' | 'TEST' | 'VERIFY';

// 에이전트 이름 (7개 고정)
type AgentName = 'architect' | 'qa' | 'coder' | 'tester' | 'qc' | 'reviewer' | 'documenter';

// 기능 상태
type FeatureStatus = 'pending' | 'designing' | 'coding' | 'testing' | 'verifying' | 'complete' | 'failed';
```

## Phase 2: auth 모듈

구현 순서:
1. `src/auth/types.ts` — AuthProvider 인터페이스, AuthMode, Credential 타입
2. `src/auth/api-key-auth.ts` — ANTHROPIC_API_KEY 기반 인증. rate limit 헤더 파싱
3. `src/auth/subscription-auth.ts` — CLAUDE_CODE_OAUTH_TOKEN 기반. usage 누적 추적
4. `src/auth/auth-manager.ts` — 환경변수 감지 → 적절한 AuthProvider 생성. 동시 설정 불가 검증
5. `src/auth/index.ts` — public API re-export

규칙: credential 저장 금지. 환경변수에서만 읽기. 두 환경변수 동시 설정 시 에러.

## Phase 3: rag 모듈

구현 순서:
1. `src/rag/types.ts` — EmbeddingProvider 인터페이스, SearchResult, ChunkMetadata 타입
2. `src/rag/embeddings.ts` — 4-Provider Tier 구현. 상세: `.claude/skills/rag-integration/references/embedding-tiers.md`
3. `src/rag/vector-store.ts` — LanceDB 연동. 테이블 4개 관리. 스키마: `.claude/skills/rag-integration/references/lancedb-schemas.md`
4. `src/rag/chunk-splitter.ts` — 코드/텍스트 청킹 전략
5. `src/rag/code-indexer.ts` — 파일 시스템 스캔 → 청킹 → 임베딩 → 인덱싱
6. `src/rag/search.ts` — 하이브리드 검색 (벡터 + BM25 + SQL 필터)
7. `src/rag/vectorizer.ts` — 상위 API (인덱싱 + 검색 통합)
8. `src/rag/index.ts` — public API

### EmbeddingProvider 인터페이스

```typescript
interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<Result<Float32Array[]>>;
  embedQuery(query: string): Promise<Result<Float32Array>>;
}
```

## Phase 4: mcp 모듈

구현 순서:
1. `src/mcp/types.ts` — McpServer, McpTool, McpManifest 타입
2. `src/mcp/registry.ts` — MCP 서버 등록/조회. 글로벌+프로젝트 병합
3. `src/mcp/loader.ts` — `~/.adev/mcp/` + `/project/.adev/mcp/` 로드
4. `src/mcp/mcp-manager.ts` — 라이프사이클 관리 (start/stop/health check)
5. builtin 4개: `os-control/`, `browser/`, `web-search/`, `git/` 각각 index.ts + 개별 파일
6. `src/mcp/index.ts` — public API

## Phase 5: layer1 모듈

구현 순서:
1. `src/layer1/types.ts` — ConversationMessage, HandoffPackage, TestTypeDefinition, ContractSchema 타입
2. `src/layer1/conversation.ts` — Claude API 대화 관리. LanceDB 영구 저장
3. `src/layer1/planner.ts` — 기획 흐름 (아이디어→기획→설계→스택)
4. `src/layer1/designer.ts` — 설계 상세화
5. `src/layer1/spec-builder.ts` — 스펙 확정본 생성
6. `src/layer1/test-type-designer.ts` — 테스트 케이스 유형 정의서 생성 (카테고리, 규칙, 샘플, 비율)
7. `src/layer1/contract-builder.ts` — Contract 기반 HandoffPackage 생성. 필수 원칙 5가지 충족 검증
8. `src/layer1/verifier.ts` — 4중 검증 중 1계층 참여 ("의도대로 구현되었는가?")
9. `src/layer1/index.ts` — public API

핵심 규칙: 유저 "확정" 전까지 개발 시작 언급 절대 금지.

## Phase 6: layer2 모듈 (가장 복잡 — 16개 파일)

의존성 순서대로 구현:

### 6-A: 기반 모듈

1. `src/layer2/types.ts` — AgentConfig, AgentEvent, PhaseTransition, VerificationResult 타입
2. `src/layer2/phase-engine.ts` — 4-Phase FSM. 전환 규칙 명시. 상세: `docs/references/PHASE-ENGINE.md`
3. `src/layer2/agent-spawner.ts` — SDK V2 Session 생성 + env 설정. AgentExecutor 구현
4. `src/layer2/session-manager.ts` — 세션 생명주기. LanceDB 스냅샷 저장/복원
5. `src/layer2/token-monitor.ts` — 토큰 사용량 추적. API key: 헤더 / Subscription: 누적
6. `src/layer2/progress-tracker.ts` — 기능별/Phase별 진행률

### 6-B: 개발 제어

7. `src/layer2/handoff-receiver.ts` — Contract 수신. 구조 검증 (필수 원칙 5가지) + 정합성 검증
8. `src/layer2/agent-generator.ts` — 에이전트.md + SKILL.md 자동 생성. 프로젝트 스펙 맞춤
9. `src/layer2/coder-allocator.ts` — Coder×N 분할. Git branch 관리. 모듈 단위 분배
10. `src/layer2/stream-monitor.ts` — SDK 스트림 감시. Hook (PreToolUse/PostToolUse/TeammateIdle)
11. `src/layer2/bias-detector.ts` — 확증편향/루프/교착 탐지
12. `src/layer2/failure-handler.ts` — 실패 유형 분류 + 복구 전략

### 6-C: 검증 + 통합

13. `src/layer2/verification-gate.ts` — 4중 검증 종합 판단 (qa/qc → reviewer → 1계층 → adev)
14. `src/layer2/integration-tester.ts` — 2계층-B 통합 테스트 오케스트레이션. 계단식 Fail-Fast
15. `src/layer2/clean-env-manager.ts` — 클린 환경 생성/삭제
16. `src/layer2/user-checkpoint.ts` — 2계층-C 유저 확인 흐름

### 6-D: 오케스트레이터 (마지막)

17. `src/layer2/team-leader.ts` — 메인 오케스트레이터. 위 모든 모듈 조합. Phase 루프 제어
18. `src/layer2/index.ts` — public API

## Phase 7: layer3 모듈

구현 순서:
1. `src/layer3/types.ts` — DocumentTemplate, DeliverableType 타입
2. `src/layer3/doc-integrator.ts` — 2계층 조각 문서 → 통합 프로젝트 문서
3. `src/layer3/doc-collaborator.ts` — 1계층(뼈대) + 2계층(상세) 협업 문서 생성
4. `src/layer3/production-tester.ts` — 지속 E2E 실행 (유지보수). Fail-Fast 적용
5. `src/layer3/bug-escalator.ts` — 3계층→2계층 버그 리포트 + 재실행 트리거
6. `src/layer3/deliverable-builder.ts` — 포트폴리오, 사업계획서, PPTX 등 비즈니스 산출물
7. `src/layer3/index.ts` — public API

## Phase 8: cli 모듈

구현 순서:
1. `src/cli/types.ts` — CliCommand, CliOptions 타입
2. `src/cli/commands/init.ts` — 프로젝트 초기화. 인증 선택. .adev/ 생성
3. `src/cli/commands/start.ts` — 1계층 대화 시작
4. `src/cli/commands/config.ts` — 설정 조회/변경
5. `src/cli/commands/project.ts` — 프로젝트 CRUD (add/remove/list/switch/update)
6. `src/cli/main.ts` — 명령어 라우팅
7. `src/index.ts` — 엔트리포인트 (CLI bin)

규칙: `process.exit()` 허용은 CLI 진입점에서만.

## Phase 9: 통합 테스트

1. `tests/module/` — 모듈 간 통합 테스트
2. `tests/e2e/` — 전체 시스템 E2E 테스트
3. 전체 `bun run check` (typecheck + lint + test) 통과 확인
