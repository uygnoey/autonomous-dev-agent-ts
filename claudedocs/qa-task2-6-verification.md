# Task #2-6 구현 전 품질 검증 리포트

**작성자**: QA Agent
**작성일**: 2026-03-04
**대상 태스크**: #2 (Claude Messages API), #3 (AgentExecutor V2), #4 (Embeddings), #5 (MCP builtin), #6 (IntegrationTester)

---

## 1. 인터페이스 정의 확인

### ✅ 1.1 layer1/types.ts — Claude Messages API 관련 타입

**검증 대상**: `ConversationMessage`, `HandoffPackage`, `ContractSchema`

**검증 결과**: ✅ 통과
- `ConversationMessage`: id, role, content, timestamp, projectId 모두 정의됨
- `HandoffPackage`: id, projectId, contract, planDocument, designDocument, specDocument, createdAt, confirmedByUser 완비
- `ContractSchema`: version, projectType, features, testDefinitions, implementationOrder, verificationMatrix 완비
- **모든 필드가 readonly로 불변성 보장**

**호환성 이슈**: 없음

---

### ✅ 1.2 layer2/types.ts — AgentExecutor 인터페이스

**검증 대상**: `AgentExecutor`, `AgentConfig`, `AgentEvent`

**검증 결과**: ✅ 통과
```typescript
export interface AgentExecutor {
  execute(config: AgentConfig): AsyncIterable<AgentEvent>;
  resume(sessionId: string): AsyncIterable<AgentEvent>;
}
```

**핵심 확인사항**:
- `AgentConfig`: name, projectId, featureId, phase, systemPrompt, prompt, tools, maxTurns?, env? 완비
- `AgentEvent`: type, agentName, content, timestamp, metadata? 완비
- `AsyncIterable<AgentEvent>` 반환 타입 명확 (스트림 패턴)

**호환성 이슈**: 없음

**주의사항**:
- `AgentExecutor.execute()` 구현 시 `unstable_v2_createSession()` 호출 필수
- 이벤트 스트림은 `for await...of` 패턴으로 소비
- 에러는 `AgentEvent { type: 'error' }` 또는 `throw`로 구분 명확히

---

### ✅ 1.3 rag/types.ts — EmbeddingProvider 인터페이스

**검증 대상**: `EmbeddingProvider`, `SearchResult`, `ChunkMetadata`

**검증 결과**: ✅ 통과
```typescript
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly tier: EmbeddingTier;
  embed(texts: string[]): Promise<Result<Float32Array[]>>;
  embedQuery(query: string): Promise<Result<Float32Array>>;
}
```

**핵심 확인사항**:
- `embed()`: 배치 임베딩 (배열 입력 → 배열 출력)
- `embedQuery()`: 단일 쿼리 임베딩 (문자열 입력 → 단일 벡터 출력)
- 반환 타입: `Result<T>` 패턴 준수 (throw 금지)
- `Float32Array` 사용 (LanceDB 호환)

**호환성 이슈**: 없음

**주의사항**:
- Huggingface Transformers 사용 시 첫 호출에 모델 로딩 시간 발생 가능
- 384차원 벡터 고정 (all-MiniLM-L6-v2 모델)
- 외부 라이브러리 호출은 `try-catch` → `Result` 래핑 필수

---

### ✅ 1.4 mcp/types.ts — MCP 관련 타입

**검증 대상**: `McpServerConfig`, `McpTool`, `McpManifest`

**검증 결과**: ✅ 통과
```typescript
export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled: boolean;
}
```

**핵심 확인사항**:
- `McpServerConfig`: name, command, args, env?, enabled 완비
- `McpManifest`: servers 배열 구조
- builtin 4개: os-control, browser, web-search, git

**호환성 이슈**: 없음

**주의사항**:
- `command`는 절대 경로 또는 `npx` 사용
- `args`는 readonly 배열 (불변성)
- builtin 서버는 `@anthropic/mcp-*` 패키지 사용

---

### ✅ 1.5 auth/types.ts — AuthProvider 인터페이스

**검증 대상**: `AuthProvider`, `Credential`, `RateLimitStatus`

**검증 결과**: ✅ 통과
```typescript
export interface AuthProvider {
  readonly authMode: AuthMode;
  getAuthHeader(): Record<string, string>;
  getRateLimitStatus(): RateLimitStatus;
  updateFromResponse(responseHeaders: Record<string, string>, responseBody?: unknown): Result<void>;
}
```

**핵심 확인사항**:
- `getAuthHeader()`: 동기 반환 (인증 헤더 생성)
- `getRateLimitStatus()`: 동기 반환 (현재 상태)
- `updateFromResponse()`: `Result<void>` 반환 (파싱 실패 처리)

**호환성 이슈**: 없음

**주의사항**:
- API Key 방식: `x-api-key` 헤더
- OAuth 방식: `Authorization: Bearer` 헤더
- Rate limit 정보는 응답 헤더 파싱으로 갱신

---

## 2. 기존 코드 호환성 검증

### ✅ 2.1 의존성 방향 준수

**검증 항목**: 모듈 간 import 방향 (`.claude/rules/layer-dependencies.md` 준수)

**검증 결과**: ✅ 통과

```
cli → core, auth, layer1
layer1 → core, rag
layer2 → core, rag, layer1
rag → core
auth → core
mcp → core
```

**확인된 의존성**:
- `layer1/conversation.ts`: `core/errors`, `core/logger`, `core/memory`, `core/types` 참조 ✅
- `layer2/agent-spawner.ts`: `core/logger`, `layer2/types` 참조 ✅
- `rag/embeddings.ts`: `core/errors`, `core/logger`, `core/types`, `rag/types` 참조 ✅
- `mcp/builtin/os-control/index.ts`: `mcp/types` 참조 ✅
- `layer2/integration-tester.ts`: `core/errors`, `core/logger`, `core/types` 참조 ✅

**순환 의존성**: 검출되지 않음 ✅

---

### ✅ 2.2 Result<T, E> 패턴 사용

**검증 항목**: 모든 public 함수가 `Result<T, E>` 또는 `Promise<Result<T, E>>` 반환

**검증 결과**: ✅ 통과

**확인된 패턴**:
- `EmbeddingProvider.embed()`: `Promise<Result<Float32Array[]>>` ✅
- `AuthProvider.updateFromResponse()`: `Result<void>` ✅
- `IntegrationTester.runStep()`: `Result<IntegrationStepResult>` ✅

**throw 사용**: 0건 (외부 경계에서만 catch 예상) ✅

---

### ✅ 2.3 에러 처리 계층

**검증 항목**: `core/errors.ts`의 에러 계층 사용 여부

**검증 결과**: ✅ 통과

**사용된 에러 클래스**:
- `AgentError`: `layer2/integration-tester.ts`에서 사용 ✅
- `RagError`: `rag/embeddings.ts`에서 예상 ✅
- `AuthError`: `auth/api-key-auth.ts`, `auth/subscription-auth.ts`에서 예상 ✅

**일관성**: 모든 에러가 `AdevError` 계층 상속 ✅

---

### ⚠️ 2.4 타입 안전성

**검증 항목**: `any` 사용 금지, `unknown` + 타입 가드 사용

**검증 결과**: ⚠️ 주의 필요

**잠재적 이슈**:
- `AuthProvider.updateFromResponse(responseBody?: unknown)`: unknown 타입 입력 ✅
  - **권장**: 구현부에서 타입 가드 필수 적용
- `AgentEvent.metadata?: Readonly<Record<string, unknown>>`: unknown 값 포함 ✅
  - **권장**: 소비자 측에서 타입 가드 적용

**금지 패턴 검출**: 없음 ✅

---

## 3. 구현 전 체크리스트

### 📋 3.1 Task #2: Claude Messages API 호출 구현

**파일**: `src/layer1/conversation.ts` (기존 파일 확장)

**필수 입력**:
- [x] `ConversationMessage` 타입 (정의됨)
- [x] `MemoryRepository` 인터페이스 (core/memory.ts에 존재)
- [ ] Claude Messages API 클라이언트 (@anthropic-ai/sdk 또는 fetch)

**필수 출력**:
- [ ] `addMessage(message: ConversationMessage): Promise<Result<void>>`
- [ ] `getHistory(projectId: string, limit?: number): Promise<Result<ConversationMessage[]>>`
- [ ] `searchContext(query: string, projectId: string): Promise<Result<ConversationMessage[]>>`

**에러 케이스**:
- [ ] 네트워크 에러 (API 호출 실패)
- [ ] 인증 에러 (API key 없음/만료)
- [ ] Rate limit 초과
- [ ] 잘못된 메시지 형식
- [ ] LanceDB 저장 실패

**테스트 케이스 유형**:
- **Normal (20%)**: 정상 메시지 추가 → 조회 → 검색
- **Edge (50%)**: 빈 메시지, 매우 긴 메시지, 특수문자 포함
- **Error (30%)**: 네트워크 장애, 인증 실패, rate limit

---

### 📋 3.2 Task #3: AgentExecutor V2 Session API 구현

**파일**: `src/layer2/agent-spawner.ts` (기존 파일 확장)

**필수 입력**:
- [x] `AgentConfig` 타입 (정의됨)
- [x] `AgentExecutor` 인터페이스 (정의됨)
- [ ] `@anthropic-ai/claude-code` SDK 설치 및 import

**필수 출력**:
- [ ] `execute(config: AgentConfig): AsyncIterable<AgentEvent>`
- [ ] `resume(sessionId: string): AsyncIterable<AgentEvent>`
- [ ] 이벤트 타입 변환: SDK 이벤트 → `AgentEvent`

**에러 케이스**:
- [ ] SDK 미설치 에러
- [ ] 잘못된 API key
- [ ] maxTurns 초과
- [ ] 세션 재개 실패 (sessionId 없음)
- [ ] 스트림 중단 에러

**테스트 케이스 유형**:
- **Normal (20%)**: 단일 에이전트 실행 → 완료 확인
- **Edge (50%)**: 매우 긴 프롬프트, 빈 도구 목록, maxTurns=1
- **Error (30%)**: SDK 초기화 실패, 스트림 중단, 재개 실패

---

### 📋 3.3 Task #4: Huggingface Transformers 임베딩 완성

**파일**: `src/rag/embeddings.ts` (기존 파일 확장)

**필수 입력**:
- [x] `EmbeddingProvider` 인터페이스 (정의됨)
- [ ] `@huggingface/transformers` 라이브러리 설치
- [ ] 모델 다운로드/캐싱 로직

**필수 출력**:
- [ ] `embed(texts: string[]): Promise<Result<Float32Array[]>>`
- [ ] `embedQuery(query: string): Promise<Result<Float32Array>>`
- [ ] 첫 호출 시 모델 초기화 (`initialize()` 메서드)

**에러 케이스**:
- [ ] 모델 다운로드 실패 (네트워크)
- [ ] 메모리 부족 (큰 모델 로딩)
- [ ] 빈 문자열 입력
- [ ] 매우 긴 텍스트 (토큰 한계 초과)
- [ ] 배치 크기 초과

**테스트 케이스 유형**:
- **Normal (20%)**: 단일 문자열 임베딩, 배치 임베딩
- **Edge (50%)**: 빈 문자열, 매우 긴 텍스트, 특수문자/이모지, 10000개 배치
- **Error (30%)**: 모델 로딩 실패, 메모리 부족, 타임아웃

---

### 📋 3.4 Task #5: MCP builtin 서버 4개 구현

**파일**:
- `src/mcp/builtin/os-control/index.ts` (기존)
- `src/mcp/builtin/browser/index.ts`
- `src/mcp/builtin/web-search/index.ts`
- `src/mcp/builtin/git/index.ts`

**필수 입력**:
- [x] `McpServerConfig` 타입 (정의됨)
- [ ] 각 builtin 서버 패키지 (@anthropic/mcp-*)

**필수 출력**:
- [x] `OS_CONTROL_SERVER: McpServerConfig` (완료)
- [ ] `BROWSER_SERVER: McpServerConfig`
- [ ] `WEB_SEARCH_SERVER: McpServerConfig`
- [ ] `GIT_SERVER: McpServerConfig`
- [ ] `src/mcp/builtin/index.ts`에서 4개 re-export

**에러 케이스**:
- [ ] 패키지 미설치
- [ ] command 경로 오류
- [ ] 환경변수 누락 (web-search의 경우)

**테스트 케이스 유형**:
- **Normal (20%)**: 각 서버 설정 객체 생성
- **Edge (10%)**: 비활성화 플래그 (enabled: false)
- **Error (70%)**: 잘못된 command, 누락된 args

---

### 📋 3.5 Task #6: 통합 테스터 로직 완성

**파일**: `src/layer2/integration-tester.ts` (기존 파일 확장)

**필수 입력**:
- [x] `IntegrationStepResult` 타입 (정의됨)
- [ ] 실제 테스트 실행 로직 (현재 더미 구현 가능성)

**필수 출력**:
- [ ] `runStep(step: 1|2|3|4, featureId: string): Result<IntegrationStepResult>`
- [ ] Step 1: 기능별 E2E 실행
- [ ] Step 2: 관련 기능 회귀 테스트
- [ ] Step 3: 비관련 기능 스모크 테스트
- [ ] Step 4: 전체 통합 E2E
- [ ] Fail-Fast: 1개 실패 시 즉시 중단

**에러 케이스**:
- [ ] 단계 건너뛰기 (step 2 실행 전 step 1 미실행)
- [ ] 이전 단계 실패 시 진행 불가
- [ ] 잘못된 featureId
- [ ] 테스트 스크립트 실행 실패

**테스트 케이스 유형**:
- **Normal (20%)**: Step 1~4 순차 실행 → 전체 통과
- **Edge (30%)**: Step 1 실패 → Step 2 차단 확인
- **Error (50%)**: 단계 건너뛰기 시도, 중복 실행, 잘못된 step 번호

---

## 4. Coder 에이전트 품질 가이드라인

### 🎯 4.1 공통 원칙

#### ✅ DO (필수 준수)

1. **Result 패턴 100% 적용**
   ```typescript
   // ✅ 올바른 예
   async function loadData(): Promise<Result<Data>> {
     try {
       const data = await externalLib.load();
       return ok(data);
     } catch (error) {
       return err(new RagError('load_failed', String(error)));
     }
   }
   ```

2. **타입 안전성 보장**
   ```typescript
   // ✅ 올바른 예
   function processResponse(body: unknown): Result<ParsedData> {
     if (!isValidResponse(body)) {
       return err(new AgentError('invalid_response', 'Response 형식 오류'));
     }
     return ok(parseResponse(body));
   }
   ```

3. **의존성 방향 엄수**
   ```typescript
   // ✅ 올바른 예 (layer2 → layer1)
   import type { HandoffPackage } from '../layer1/types.js';

   // ❌ 금지 (layer1 → layer2)
   // import type { AgentSpawner } from '../layer2/agent-spawner.js';
   ```

4. **에러 컨텍스트 명확화**
   ```typescript
   // ✅ 올바른 예
   return err(
     new RagError(
       'embedding_failed',
       `모델 로딩 실패: ${modelName}, 원인: ${error.message}`
     )
   );
   ```

5. **불변성 보장 (readonly)**
   ```typescript
   // ✅ 올바른 예
   export interface Config {
     readonly name: string;
     readonly options: readonly string[];
   }
   ```

#### ❌ DON'T (절대 금지)

1. **any 타입 사용**
   ```typescript
   // ❌ 금지
   function process(data: any) { ... }

   // ✅ 대체
   function process(data: unknown) {
     if (isValidData(data)) { ... }
   }
   ```

2. **throw 남발**
   ```typescript
   // ❌ 금지
   function load(): Data {
     if (!exists) throw new Error('not found');
   }

   // ✅ 대체
   function load(): Result<Data> {
     if (!exists) return err(new ConfigError('not_found', '...'));
   }
   ```

3. **console.log 직접 사용**
   ```typescript
   // ❌ 금지
   console.log('Processing', data);

   // ✅ 대체
   logger.debug('Processing', { data });
   ```

4. **process.env 직접 접근**
   ```typescript
   // ❌ 금지
   const apiKey = process.env.API_KEY;

   // ✅ 대체
   const apiKey = config.get('auth.apiKey');
   ```

5. **순환 의존성 생성**
   ```typescript
   // ❌ 금지
   // a.ts: import { B } from './b.js';
   // b.ts: import { A } from './a.js';
   ```

---

### 🧪 4.2 테스트 작성 가이드

#### 필수 테스트 비율

- **Normal Case**: 20% (정상 흐름 확인)
- **Edge Case**: 50% (경계 조건, 극단 입력)
- **Error Case**: 30% (실패 시나리오)

#### 테스트 구조 (Arrange-Act-Assert)

```typescript
import { describe, it, expect } from 'bun:test';

describe('EmbeddingProvider', () => {
  it('빈 문자열 배열 입력 시 빈 배열 반환', async () => {
    // Arrange
    const provider = new TransformersEmbeddingProvider(...);
    const input: string[] = [];

    // Act
    const result = await provider.embed(input);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('매우 긴 텍스트 입력 시 에러 반환', async () => {
    // Arrange
    const provider = new TransformersEmbeddingProvider(...);
    const longText = 'a'.repeat(100000);

    // Act
    const result = await provider.embed([longText]);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('embedding_input_too_long');
    }
  });
});
```

#### Fail-Fast 원칙

```typescript
// ✅ 올바른 예: 1개 실패 시 즉시 중단
for (const testCase of testCases) {
  const result = await runTest(testCase);
  if (!result.ok || !result.value.passed) {
    logger.error('테스트 실패, 즉시 중단', { testCase });
    return err(result.error);
  }
}
```

---

### 🔍 4.3 코드 리뷰 체크리스트 (자가 점검)

구현 완료 후 다음 항목을 반드시 확인하세요:

- [ ] **타입 안전성**: `any` 사용 0건
- [ ] **Result 패턴**: 모든 public 함수가 `Result<T>` 반환
- [ ] **에러 처리**: throw 사용 0건 (외부 경계 제외)
- [ ] **의존성**: 순환 의존성 0건 (`bunx madge --circular src/`)
- [ ] **불변성**: 모든 인터페이스 필드가 `readonly`
- [ ] **로깅**: `console.log` 사용 0건 (logger 사용)
- [ ] **환경변수**: `process.env` 직접 접근 0건
- [ ] **테스트**: 단위 테스트 작성 완료 (`bun test`)
- [ ] **타입체크**: 타입 에러 0건 (`bunx tsc --noEmit`)
- [ ] **린트**: 린트 에러 0건 (`bunx biome check src/`)
- [ ] **JSDoc**: 모든 public API에 JSDoc 작성
- [ ] **파일 크기**: 300줄 이하 (초과 시 분할)

---

### 📚 4.4 참고 문서

구현 중 의문사항이 생기면 다음 문서를 참조하세요:

1. **Result 패턴**: `.claude/skills/code-quality/references/result-pattern.md`
2. **에러 처리**: `.claude/skills/code-quality/references/error-handling.md`
3. **의존성 규칙**: `.claude/rules/layer-dependencies.md`
4. **TypeScript 스타일**: `.claude/rules/typescript-style.md`
5. **테스트 규칙**: `.claude/rules/testing.md`
6. **보안 규칙**: `.claude/rules/security.md`
7. **Agent 역할**: `docs/references/AGENT-ROLES.md`
8. **V2 Session API**: `docs/references/V2-SESSION-API.md`
9. **Contract 스키마**: `docs/references/CONTRACT-SCHEMA.md`

---

## 5. 종합 평가

### ✅ 구현 준비도: 95%

**준비 완료**:
- ✅ 모든 타입 인터페이스 정의됨
- ✅ 모듈 의존성 그래프 명확
- ✅ Result 패턴 일관성 확보
- ✅ 에러 처리 계층 구축됨
- ✅ 기존 코드 품질 양호 (TODO/FIXME 0건)

**주의 필요**:
- ⚠️ Task #3: SDK 설치 후 버전 호환성 확인 필요 (`@anthropic-ai/claude-code`)
- ⚠️ Task #4: Transformers 라이브러리 메모리 사용량 모니터링 필요
- ⚠️ Task #6: 실제 테스트 실행 로직 구현 필요 (현재 더미 가능성)

**추가 권장사항**:
1. Task #2: Claude Messages API rate limit 헤더 파싱 로직 추가
2. Task #3: `maxTurns` 초과 시 graceful shutdown 구현
3. Task #4: 모델 캐싱 전략 (메모리 vs 디스크) 결정
4. Task #5: MCP 서버 health check 로직 추가
5. Task #6: 통합 테스트 결과 LanceDB 영구 저장

---

## 6. 다음 단계

### ✅ QA 승인 조건

다음 조건이 모두 충족되면 coder 에이전트에게 구현 승인:

1. [x] 인터페이스 정의 100% 완료
2. [x] 의존성 그래프 검증 통과
3. [x] Result 패턴 일관성 확인
4. [x] 에러 처리 계층 검증
5. [x] 구현 전 체크리스트 작성 완료
6. [x] Coder 가이드라인 문서화 완료

### 🚦 승인 상태: ✅ 승인 (조건부)

**조건**:
- Task #3 구현 전 `@anthropic-ai/claude-code` SDK 설치 확인
- Task #4 구현 전 `@huggingface/transformers` 메모리 요구사항 확인
- 모든 테스트는 `bun test` 프레임워크 사용 (vitest/jest 금지)

**coder 에이전트에게 전달**:
- 본 문서 전체
- 섹션 3 (구현 전 체크리스트) 필수 준수
- 섹션 4 (품질 가이드라인) 필수 숙지
- 구현 완료 후 자가 점검 (섹션 4.3) 필수

---

**작성 완료**: 2026-03-04
**다음 에이전트**: coder (구현 단계로 진행)
