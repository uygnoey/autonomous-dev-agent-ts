# Reviewer 코드 품질 리포트
## 분석 일시: 2026-03-26

### 1. any 타입 사용 사례

**결과: 위반 없음**

`src/` 전체를 `\bany\b` 패턴으로 검색한 결과, 실제 `any` 타입으로 사용된 사례는 없음.
검색에서 매칭된 항목은 모두 JSDoc 설명 내 영어 단어 "any" (예: "if any", "without any wrapping")로, 타입 선언이 아님.

| 파일 | 라인 | 코드 | 판정 |
|------|------|------|------|
| - | - | - | 위반 없음 |

---

### 2. console.log 직접 사용

**결과: 위반 없음 (JSDoc 예시만 존재)**

`console.(log|warn|error|info|debug)` 검색 결과 18건 매칭되었으나, **전부 JSDoc `@example` 블록 내부**의 사용 예시임.
실제 코드에서 `console.log`를 호출하는 라인은 0건.

| 파일 | 라인 | 코드 | 판정 |
|------|------|------|------|
| `src/core/logger.ts:5` | 5 | `* console.log 대체...` | JSDoc 설명 |
| `src/core/errors.ts:62` | 62 | `*   console.error(caught.code...)` | JSDoc 예시 |
| `src/rag/openai-embeddings.ts:192` | 192 | `* if (result.ok) console.log(...)` | JSDoc 예시 |
| `src/rag/embedding-factory.ts:188,192` | 188,192 | `* if (result.ok) console.log(...)` | JSDoc 예시 |
| (기타 13건 동일) | - | - | JSDoc 예시 |

---

### 3. process.env 직접 접근

**결과: 3건 — 허용 가능한 예외 포함**

`src/core/config.ts`는 공식 진입점이므로 제외. 나머지 파일 분석:

| 파일 | 라인 | 코드 | 판정 |
|------|------|------|------|
| `src/index.ts` | 73-74 | `if (!process.env[key]) { process.env[key] = value; }` | **LOW** — 앱 엔트리포인트에서 `.env` 파일 로드. 부트스트랩 단계로 허용 가능 |
| `src/layer2/v2-session-env-builder.ts` | 42 | `...(process.env as Record<string, string>)` | **MEDIUM** — SDK env 파라미터 구성. config.ts 경유가 이상적이지만 SDK 제약으로 인한 허용 가능한 예외 |
| `src/core/process-executor.ts` | 121 | `env: { ...process.env, ...env }` | **LOW** — 자식 프로세스에 환경변수 전달. core 모듈 내부이므로 허용 가능 |

---

### 4. Result 패턴 미준수 (throw 과다 사용)

**결과: 양호 — throw 사용 1건, 나머지는 Result 패턴 준수**

| 파일 | 라인 | 문제 | 판정 |
|------|------|------|------|
| `src/core/process-executor.ts` | 229 | `throw new AdevError(...)` | **LOW** — 시스템 경계 (child_process 실행 실패)에서의 throw. 규칙상 "경계에서만 catch" 허용 |
| `src/layer2/agent-spawner.ts` | 76, 113 | 주석에서 "throw 대신 에러 이벤트 yield" 설명 | 준수 (yield 패턴 사용) |
| `src/layer2/verification-escalator.ts` | 124 | 주석에서 "throw 전파 금지" 설명 | 준수 (catch 후 에러 처리) |

---

### 5. 300줄 초과 파일

**결과: 31개 파일 — MEDIUM 심각도**

300줄 초과 파일이 다수 존재. 규칙: "300줄 초과 시 분할 필수"

| 파일 | 줄 수 | 심각도 |
|------|-------|--------|
| `src/cli/commands/project-crud.ts` | 564 | **HIGH** |
| `src/layer3/bug-escalator.ts` | 493 | **HIGH** |
| `src/layer3/doc-integrator-fragment.ts` | 490 | **HIGH** |
| `src/layer2/v2-session-executor.ts` | 489 | **HIGH** |
| `src/layer2/user-checkpoint.ts` | 483 | **HIGH** |
| `src/layer3/doc-collaborator.ts` | 463 | **HIGH** |
| `src/layer1/contract-change-manager.ts` | 430 | **HIGH** |
| `src/mcp/mcp-manager.ts` | 415 | MEDIUM |
| `src/layer1/claude-api.ts` | 399 | MEDIUM |
| `src/layer1/test-type-designer.ts` | 387 | MEDIUM |
| `src/layer2/git-branch-manager.ts` | 373 | MEDIUM |
| `src/layer2/team-leader.ts` | 370 | MEDIUM |
| `src/auth/subscription-auth.ts` | 366 | MEDIUM |
| `src/layer2/session-manager.ts` | 344 | MEDIUM |
| `src/layer2/team-leader-helpers.ts` | 339 | MEDIUM |
| `src/layer3/production-tester.ts` | 338 | MEDIUM |
| `src/layer2/agent-generator.ts` | 334 | MEDIUM |
| `src/layer2/layer2-bootstrap.ts` | 332 | MEDIUM |
| `src/cli/commands/start-execution.ts` | 332 | MEDIUM |
| `src/layer2/parallel-coder-runner.ts` | 330 | MEDIUM |
| `src/layer2/parallel-coder-supervision.ts` | 329 | MEDIUM |
| `src/layer3/doc-integrator-template.ts` | 327 | MEDIUM |
| `src/layer2/team-leader-test-phase.ts` | 327 | MEDIUM |
| `src/rag/openai-embeddings.ts` | 326 | MEDIUM |
| `src/layer2/team-leader-verify.ts` | 326 | MEDIUM |
| `src/layer1/skill-md-generator.ts` | 320 | MEDIUM |
| `src/layer2/bias-detector.ts` | 317 | MEDIUM |
| `src/cli/commands/start-pipeline.ts` | 316 | MEDIUM |
| `src/layer2/session-restore-orchestrator.ts` | 309 | MEDIUM |
| `src/layer2/team-leader-phase.ts` | 305 | MEDIUM |
| `src/layer1/conversation.ts` | 301 | MEDIUM |

---

### 6. JSDoc 누락 (export 함수/인터페이스)

**결과: 2건 — LOW 심각도**

전체 `export function/const/class` 선언 중 JSDoc 없는 항목:

| 파일 | 라인 | 항목명 | 판정 |
|------|------|--------|------|
| `src/rag/embedding-factory.ts` | 265 | `function parseEmbeddingProviderType` | LOW |
| `src/layer2/team-leader-phase.ts` | 250 | `function advancePhase` | LOW |

대다수 export에는 이중 언어(한국어+영어) JSDoc이 작성되어 있어 전반적으로 양호함.

---

### 7. non-null assertion (!) 사용

**결과: 5건 — MEDIUM 심각도**

규칙: "non-null assertion (`!`) 금지. optional chaining + nullish coalescing 사용"

| 파일 | 라인 | 코드 | 판정 |
|------|------|------|------|
| `src/layer2/stream-monitor.ts` | 260 | `agentEvents[agentEvents.length - 1]!.timestamp` | **MEDIUM** — optional chaining + fallback으로 대체 가능 |
| `src/layer2/team-leader-phase.ts` | 223 | `deps.userCheckpoint!.requestConfirmation(...)` | **MEDIUM** — 타입 가드 추가 필요 |
| `src/layer2/team-leader-phase.ts` | 223 | `deps.userInputProvider!` | **MEDIUM** — 동일 라인, 두 번째 non-null assertion |
| `src/auth/subscription-auth.ts` | 272 | `this.usageHistory[0]!.timestamp` | **MEDIUM** — 배열 길이 확인 후 접근으로 대체 가능 |
| `src/layer1/agent-md-reviewer.ts` | 96 | `ALL_AGENT_NAMES[i]!` | **MEDIUM** — 배열 인덱스 접근. noUncheckedIndexedAccess strict 모드에서 필요할 수 있으나 타입 가드 권장 |

---

### 8. 하드코딩 매직값

**결과: 일부 존재 — MEDIUM 심각도**

대부분 잘 명명된 상수(`const`)로 관리되고 있으나, 일부 개선 가능한 항목:

| 파일 | 라인 | 값 | 판정 |
|------|------|-----|------|
| `src/rag/voyage-client.ts` | 18 | `'https://api.voyageai.com/v1/embeddings'` | **LOW** — 상수로 선언됨, config 이동 권장 |
| `src/rag/openai-embeddings.ts` | 21 | `'https://api.openai.com/v1/embeddings'` | **LOW** — 상수로 선언됨, config 이동 권장 |
| `src/mcp/builtin/web-search/search-operations.ts` | 121 | `'https://html.duckduckgo.com/html/?q=...'` | **LOW** — 상수 추출 권장 |
| `src/layer1/claude-api.ts` | 48 | `'claude-opus-4-20250514'` | **LOW** — 모델 ID 상수. config에서 관리 권장 |
| `src/layer1/contract-verifier.ts` | 27 | `'claude-haiku-4-5-20251001'` | **LOW** — 동일 |
| `src/layer1/contract-ai-consistency-verifier.ts` | 33 | `'claude-haiku-4-5-20251001'` | **LOW** — 동일 |
| `src/layer1/skill-md-generator.ts` | 204, 289 | `1024`, `4096` (maxTokens) | **LOW** — 매직 넘버. 명명 상수 추출 권장 |
| `src/layer1/claude-api.ts` | 172, 243 | `4096` (maxTokens 기본값) | **LOW** — 동일 |
| `src/layer3/deliverable-docx-renderer.ts` | 217 | `'1F3864'` (색상 코드) | **LOW** — 테마 상수로 추출 권장 |
| `src/layer3/deliverable-pptx-renderer.ts` | 113, 127, 137 | `'1F3864'`, `'333333'` | **LOW** — 동일 |
| `src/layer3/deliverable-pdf-renderer.ts` | 116, 118, 225, 227 | `'#666666'`, `'#333333'`, `'#999999'` | **LOW** — 동일 |
| `src/auth/subscription-auth.ts` | 24 | `'2023-06-01'` (ANTHROPIC_VERSION) | OK — 명명된 상수 |
| `src/mcp/mcp-handshake.ts` | 24 | `'2024-11-05'` (MCP_PROTOCOL_VERSION) | OK — 명명된 상수 |

---

### 9. 종합 심각도 평가

#### CRITICAL: 0건
- 보안 취약점, `any` 타입 사용, `console.log` 직접 호출 등 치명적 위반 없음

#### HIGH: 7건 — 300줄 초과 파일 (400줄+)
- `project-crud.ts` (564줄), `bug-escalator.ts` (493줄), `doc-integrator-fragment.ts` (490줄)
- `v2-session-executor.ts` (489줄), `user-checkpoint.ts` (483줄), `doc-collaborator.ts` (463줄)
- `contract-change-manager.ts` (430줄)
- **권장**: 각 파일을 책임별로 분할하여 300줄 이내로 줄일 것

#### MEDIUM: 29건
- 300줄 초과 파일 (300~415줄): 24건
- non-null assertion 사용: 5건
- **권장**: 점진적으로 분할. non-null assertion은 타입 가드 또는 optional chaining으로 대체

#### LOW: 15건
- process.env 직접 접근 (허용 가능한 예외): 3건
- JSDoc 누락 export 함수: 2건
- 하드코딩 매직값 (상수로 선언됨): ~10건
- **권장**: 매직값을 config나 명명 상수로 통합

---

### 10. 긍정적 평가 사항

1. **any 타입 완전 제거**: 전체 코드에서 `any` 타입 사용이 0건
2. **console.log 제거 완료**: 실제 코드에서 console 직접 호출 0건 (Logger 전면 사용)
3. **Result 패턴 일관 적용**: throw 사용이 극소수(1건)이며 경계에서만 사용
4. **이중 언어 JSDoc**: 대다수 export에 한국어+영어 JSDoc 작성 완료
5. **명확한 WHY 주석**: 코드 곳곳에 WHY 주석으로 설계 의도 명시
6. **에러 계층 체계**: AdevError 기반 에러 코드 체계 구축
7. **모듈 의존성 방향**: import 분석 시 순환 의존성 징후 없음
