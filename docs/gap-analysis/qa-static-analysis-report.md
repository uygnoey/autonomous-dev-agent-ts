# QA 정적 분석 리포트
## 분석 일시: 2026-03-26

---

### 1. TypeScript 타입 오류

**결과: 0건 (PASS)**

`bunx tsc --noEmit` 실행 결과, 타입 오류가 발견되지 않았습니다.

---

### 2. Biome 린트 오류/경고

**결과: 23 errors, 7 warnings (총 30건)**

#### 2.1 organizeImports (import 정렬) — 17건 (errors)

| # | 파일 | 규칙 |
|---|------|------|
| 1 | `src/cli/commands/start-execution.ts` | organizeImports |
| 2 | `src/cli/commands/start-pipeline.ts` | organizeImports |
| 3 | `src/cli/layer2-runner.ts` | organizeImports |
| 4 | `src/core/file-size-guard.ts` | organizeImports |
| 5 | `src/layer2/agent-coordinator.ts` | organizeImports |
| 6 | `src/layer2/layer2-bootstrap.ts` | organizeImports |
| 7 | `src/layer2/session-restore-orchestrator-fallback.ts` | organizeImports |
| 8 | `src/layer2/session-restore-orchestrator.ts` | organizeImports |
| 9 | `src/layer2/team-leader.ts` | organizeImports |
| 10 | `src/layer2/team-leader-code-phase.ts` | organizeImports |
| 11 | `src/layer2/team-leader-design-phase.ts` | organizeImports |
| 12 | `src/layer2/team-leader-helpers.ts` | organizeImports |
| 13 | `src/layer2/team-leader-types.ts` | organizeImports |
| 14 | `src/layer2/team-leader-verify.ts` | organizeImports |
| 15 | `src/layer2/team-leader-test-phase.ts` | organizeImports |
| 16 | `src/layer2/v2-session-executor.ts` | organizeImports |
| 17 | `src/rag/embedding-factory.ts` | organizeImports |

#### 2.2 lint/style/noNonNullAssertion — 4건 (warnings)

| # | 파일:줄 | 설명 |
|---|---------|------|
| 1 | `src/auth/subscription-auth.ts:272` | `this.usageHistory[0]!.timestamp` — optional chaining 사용 권장 |
| 2 | `src/layer1/agent-md-reviewer.ts:96` | `ALL_AGENT_NAMES[i]!` — optional chaining 사용 권장 |
| 3 | `src/layer2/team-leader-phase.ts:223` (첫번째) | non-null assertion 사용 |
| 4 | `src/layer2/team-leader-phase.ts:223` (두번째) | non-null assertion 사용 |

#### 2.3 lint/style/useTemplate (문자열 연결 → 템플릿 리터럴) — 3건 (errors)

| # | 파일:줄 | 설명 |
|---|---------|------|
| 1 | `src/cli/commands/project-crud.ts:238` | 문자열 연결을 템플릿 리터럴로 교체 필요 |
| 2 | `src/layer1/conversation-fsm.ts:191` | 문자열 연결을 템플릿 리터럴로 교체 필요 |
| 3 | `src/layer1/conversation.ts:74` | 문자열 연결을 템플릿 리터럴로 교체 필요 |

#### 2.4 lint/style/noUnusedTemplateLiteral — 3건 (errors)

| # | 파일:줄 | 설명 |
|---|---------|------|
| 1 | `src/layer1/skill-md-generator.ts:227` | 불필요한 템플릿 리터럴 사용 |
| 2 | `src/layer1/skill-md-generator.ts:237` | 불필요한 템플릿 리터럴 사용 |
| 3 | `src/layer1/skill-md-generator.ts:247` | 불필요한 템플릿 리터럴 사용 |

#### 2.5 lint/complexity/useSimplifiedLogicExpression — 3건 (warnings)

| # | 파일:줄 | 설명 |
|---|---------|------|
| 1 | `src/layer1/contract-change-manager.ts:421` | `!a && !b` → `!(a \|\| b)` 간소화 가능 |
| 2 | `src/layer1/skill-md-generator.ts:233` | 논리 표현식 간소화 가능 |
| 3 | `src/layer2/documenter-event-dispatcher.ts:196` | 논리 표현식 간소화 가능 |

> 모든 30건은 `bunx biome check --fix --unsafe`로 자동 수정 가능

---

### 3. 핵심 인터페이스 존재 여부

| 인터페이스 | 파일 위치 | 상태 |
|----------|---------|------|
| `HandoffPackage` | `src/layer1/contract-types.ts:75` | FOUND |
| `PhaseState` | (미발견) | **MISSING** |
| `PhaseFSM` | (미발견) | **MISSING** |
| `EmbeddingProvider` | `src/rag/types.ts:24` | FOUND |
| `AgentExecutor` | `src/layer2/agent-types.ts:81` | FOUND |
| `AuthProvider` | `src/auth/types.ts:63` | FOUND |
| `VectorStore` | (미발견 — `CodeVectorStore` 클래스가 `VectorRepository<CodeRecord>` 구현) | **MISSING** (대체: `VectorRepository` + `CodeVectorStore`) |
| `SessionSnapshot` | `src/layer2/session-types.ts:26` | FOUND |
| `RAGContext` | (미발견) | **MISSING** |
| `ContractSpec` | (미발견) | **MISSING** |
| `VerificationResult` | `src/layer2/phase-types.ts:51` | FOUND |

### 4. 필수 모듈 파일 존재 확인

| 파일 | 상태 |
|------|------|
| `src/layer2/phase-engine.ts` | FOUND |
| `src/rag/vector-store.ts` | FOUND |
| `src/layer2/session-manager.ts` | FOUND |
| `src/layer2/team-leader.ts` | FOUND |
| `src/layer1/contract-verifier.ts` | FOUND |

---

### 5. 정적 분석 종합 판정

| 항목 | 결과 |
|------|------|
| TypeScript 타입 오류 | **0건** |
| Biome 린트 오류 | **23건** (errors) |
| Biome 린트 경고 | **7건** (warnings) |
| 스펙 필수 타입 누락 | **5건** (`PhaseState`, `PhaseFSM`, `VectorStore`, `RAGContext`, `ContractSpec`) |
| 필수 모듈 파일 누락 | **0건** |
| **종합 판정** | **FAIL** |

#### 판정 근거

1. **타입 안전성**: tsc 통과로 컴파일 레벨 타입 안전성 확보됨
2. **코드 품질**: Biome 린트 30건 위반. 대부분 import 정렬(17건)과 스타일 이슈(13건)로, 자동 수정 가능한 낮은 심각도
3. **스펙 준수**: 스펙에서 정의한 핵심 인터페이스 5개가 누락됨. 일부는 대체 구현 존재 (`VectorStore` → `VectorRepository`, `PhaseFSM` 관련 로직은 `phase-engine.ts`에 존재할 수 있음), 나머지(`RAGContext`, `ContractSpec`)는 명시적 타입 정의 필요
4. **자동 수정 권장**: `bunx biome check --fix --unsafe` 실행으로 30건 전량 즉시 해결 가능
