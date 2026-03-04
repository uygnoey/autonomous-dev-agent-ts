> **Languages:** [한국어](../ko/claude-api.md) | [English](../en/claude-api.md) | [日本語](../ja/claude-api.md) | [Español](../es/claude-api.md)

# ClaudeApi — Claude Messages API 래퍼

## 🎯 이게 뭐야?

**초등학생 비유:**
ClaudeApi는 "AI와 대화하는 전화기"예요!

예를 들어:
- 전화기 들고 → "안녕?" 하면 → AI가 "안녕하세요!" 대답
- 긴 이야기 들을 때 → 실시간으로 한 마디씩 들려줌 (스트리밍)
- 짧은 질문할 때 → 답변 다 듣고 한 번에 받음 (비스트리밍)

전화기가 고장 나면? 자동으로 다시 걸어줘요 (재시도)
너무 오래 기다리면? 자동으로 끊어줘요 (타임아웃)

**기술 설명:**
Anthropic Claude Messages API를 래핑한 클라이언트입니다.
- 스트리밍/비스트리밍 호출 분리
- AuthProvider 통합 (API key / OAuth 토큰)
- 재시도 로직 (지수 백오프)
- AbortController 타임아웃
- 토큰 사용량 추적
- Rate limit 자동 관리

---

## 🔍 왜 필요해?

### 1. 안전한 API 호출
직접 `@anthropic-ai/sdk`를 쓰면:
- 재시도 로직을 매번 구현해야 함
- 타임아웃 처리가 복잡함
- 토큰 추적이 어려움
- Rate limit 관리를 직접 해야 함

ClaudeApi는 이걸 자동으로 해결해줍니다.

### 2. 스트리밍 vs 비스트리밍 분리
두 가지 사용 패턴을 명확히 분리:
```typescript
// 짧은 답변 → 비스트리밍 (한 번에 받기)
const result = await api.createMessage([
  { role: 'user', content: 'What is 2+2?' }
]);

// 긴 답변 → 스트리밍 (실시간으로 받기)
await api.streamMessage([
  { role: 'user', content: 'Tell me a story' }
], (event) => {
  if (event.type === 'content_delta') {
    process.stdout.write(event.text);
  }
});
```

### 3. 자동 재시도 (지수 백오프)
네트워크 에러나 rate limit 발생 시 자동 재시도:
```
시도 1: 실패 (429 Too Many Requests) → 1초 대기
시도 2: 실패 (503 Service Unavailable) → 2초 대기
시도 3: 성공! ✅
```

---

## 📐 아키텍처

### 핵심 구조

```
┌───────────────────────────────────────────┐
│ ClaudeApi                                 │
├───────────────────────────────────────────┤
│ + createMessage()  → 비스트리밍 호출      │
│ + streamMessage()  → 스트리밍 호출        │
│                                           │
│ [내부 메커니즘]                            │
│ - withRetry()      → 재시도 로직          │
│ - AbortController  → 타임아웃             │
│ - AuthProvider     → 인증 통합            │
│ - Rate Limit 추적  → 토큰 관리            │
└───────────────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ Anthropic SDK (@anthropic-ai/sdk)         │
│ messages.create()                         │
└───────────────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ Claude Messages API (Anthropic 서버)      │
└───────────────────────────────────────────┘
```

### 재시도 로직 흐름 (지수 백오프)

```
┌──────────────┐
│ API 호출 시작 │
└──────┬───────┘
       ↓
┌──────────────┐
│ 시도 1       │
└──────┬───────┘
       ↓
   성공? ───YES──→ ✅ 결과 반환
     │
     NO (에러)
     ↓
  재시도 가능? (429, 500, 502, 503, 504)
     │
     NO ───→ ❌ 에러 반환
     │
     YES
     ↓
┌──────────────┐
│ 1초 대기     │
└──────┬───────┘
       ↓
┌──────────────┐
│ 시도 2       │
└──────┬───────┘
       ↓
   성공? ───YES──→ ✅ 결과 반환
     │
     NO
     ↓
┌──────────────┐
│ 2초 대기     │
└──────┬───────┘
       ↓
┌──────────────┐
│ 시도 3       │
└──────┬───────┘
       ↓
   성공? ───YES──→ ✅ 결과 반환
     │
     NO ───→ ❌ 최종 에러 반환
```

### 타임아웃 메커니즘 (AbortController)

```
┌──────────────────────────────────┐
│ API 호출 + 타이머 시작 (60초)     │
└────────┬─────────────────────────┘
         ↓
     60초 전 완료? ───YES──→ ✅ 타이머 취소, 결과 반환
         │
         NO
         ↓
     ┌────────────────────┐
     │ AbortController.abort() │
     └────────┬───────────┘
              ↓
         ❌ 타임아웃 에러
```

---

## 🔧 의존성

### 직접 의존성
- `@anthropic-ai/sdk` — Anthropic 공식 SDK
- `../auth/types` — AuthProvider (인증)
- `../core/logger` — Logger (로깅)
- `../core/types` — Result 패턴
- `../core/errors` — AgentError, RetryPolicy

### 의존성 그래프
```
layer1/claude-api
  ↓
┌──────────────┬──────────────┬──────────────┐
│ auth/types   │ core/logger  │ core/types   │
└──────────────┴──────────────┴──────────────┘
        ↓
    core/config
```

**규칙:** layer1은 core, auth에만 의존 가능 (layer2 금지)

---

## 📦 어떻게 쓰는지?

### 단계 1: 패키지 설치 (Blocker #1 확인)

```bash
# @anthropic-ai/sdk 패키지 확인
bun pm ls | grep anthropic

# 설치되지 않았다면:
bun add @anthropic-ai/sdk

# 설치 확인
bun pm ls @anthropic-ai/sdk
```

### 단계 2: 인스턴스 생성

```typescript
import { ClaudeApi } from '../layer1/claude-api.js';
import { ApiKeyAuthProvider } from '../auth/api-key-auth.js';
import { Logger } from '../core/logger.js';
import { DEFAULT_RETRY_POLICY } from '../core/errors.js';

// 1. 로거 생성
const logger = new Logger({ level: 'info' });

// 2. 인증 프로바이더 생성
const authProvider = new ApiKeyAuthProvider(
  'your-api-key-here', // 실제로는 config에서 가져옴
  logger,
);

// 3. ClaudeApi 생성
const api = new ClaudeApi(
  authProvider,
  logger,
  DEFAULT_RETRY_POLICY, // 선택: 재시도 3회, 지수 백오프
);
```

### 단계 3: 비스트리밍 메시지 생성 (짧은 답변)

```typescript
// 간단한 질문 → 답변 한 번에 받기
const result = await api.createMessage(
  [{ role: 'user', content: 'What is 2+2?' }],
  {
    model: 'claude-opus-4-20250514',
    maxTokens: 100,
    temperature: 0.7,
    timeoutMs: 30000, // 30초 타임아웃
  },
);

if (result.ok) {
  console.log('답변:', result.value.content);
  console.log('사용 토큰:', {
    input: result.value.metadata.inputTokens,
    output: result.value.metadata.outputTokens,
  });
} else {
  console.error('에러:', result.error.message);
}
```

### 단계 4: 스트리밍 메시지 생성 (긴 답변)

```typescript
// 긴 이야기 → 실시간으로 한 마디씩 받기
const result = await api.streamMessage(
  [{ role: 'user', content: 'Tell me a long story about a dragon' }],
  (event) => {
    if (event.type === 'content_start') {
      console.log('스트리밍 시작...');
    } else if (event.type === 'content_delta') {
      // 실시간으로 텍스트 출력
      process.stdout.write(event.text);
    } else if (event.type === 'content_stop') {
      console.log('\n스트리밍 종료.');
    } else if (event.type === 'message_complete') {
      console.log('토큰 사용:', event.metadata.inputTokens, event.metadata.outputTokens);
    }
  },
  {
    maxTokens: 2048,
    timeoutMs: 120000, // 2분 타임아웃 (긴 답변용)
  },
);

if (!result.ok) {
  console.error('스트리밍 에러:', result.error.message);
}
```

### 단계 5: 다중 턴 대화

```typescript
const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];

// 첫 번째 질문
conversation.push({ role: 'user', content: 'My name is Alice' });

const result1 = await api.createMessage(conversation);
if (result1.ok) {
  conversation.push({ role: 'assistant', content: result1.value.content });
  console.log('AI:', result1.value.content);
}

// 두 번째 질문 (이전 대화 기억)
conversation.push({ role: 'user', content: 'What is my name?' });

const result2 = await api.createMessage(conversation);
if (result2.ok) {
  console.log('AI:', result2.value.content); // "Your name is Alice"
}
```

---

## ⚠️ 조심할 점

### 1. 타임아웃 설정
**기본 타임아웃: 60초**

긴 답변이나 복잡한 작업은 타임아웃을 늘려주세요:
```typescript
// ❌ 잘못된 예: 긴 이야기는 60초 안에 안 끝날 수 있음
await api.streamMessage(messages, onEvent);

// ✅ 올바른 예: 충분한 타임아웃 설정
await api.streamMessage(messages, onEvent, {
  timeoutMs: 180000, // 3분
});
```

### 2. 재시도 가능한 에러만 재시도
**재시도되는 HTTP 상태 코드:**
- `429` Too Many Requests (rate limit)
- `500` Internal Server Error
- `502` Bad Gateway
- `503` Service Unavailable
- `504` Gateway Timeout

**재시도되지 않는 에러:**
- `400` Bad Request (잘못된 요청)
- `401` Unauthorized (인증 실패)
- `403` Forbidden (권한 없음)
- `404` Not Found (모델 없음)

```typescript
const result = await api.createMessage(messages);

if (!result.ok) {
  const { code } = result.error;

  if (code === 'api_rate_limit') {
    // 재시도 후에도 실패 → rate limit 초과
    console.error('Rate limit 초과. 잠시 후 다시 시도하세요.');
  } else if (code === 'api_auth_error') {
    // 재시도 안 됨 → API key 확인 필요
    console.error('API key를 확인하세요.');
  }
}
```

### 3. maxTokens 설정
출력이 잘리지 않도록 충분한 토큰 설정:
```typescript
// ❌ 위험: 긴 답변이 잘릴 수 있음
await api.createMessage(messages, { maxTokens: 100 });

// ✅ 안전: 충분한 토큰
await api.createMessage(messages, { maxTokens: 4096 });
```

### 4. 스트리밍 이벤트 순서
스트리밍 이벤트는 순서가 보장됩니다:
```
1. content_start (시작)
2. content_delta (여러 번, 텍스트 조각)
3. content_stop (종료)
4. message_complete (메타데이터)
```

반드시 이 순서대로 처리하세요:
```typescript
let fullText = '';

await api.streamMessage(messages, (event) => {
  switch (event.type) {
    case 'content_start':
      fullText = '';
      break;
    case 'content_delta':
      fullText += event.text;
      break;
    case 'content_stop':
      console.log('전체 텍스트:', fullText);
      break;
    case 'message_complete':
      console.log('토큰:', event.metadata.outputTokens);
      break;
  }
});
```

---

## 💡 예제 코드

### 예제 1: 재시도 로직 체험

```typescript
/**
 * 재시도 로직을 테스트하는 함수
 */
async function testRetryLogic(api: ClaudeApi) {
  console.log('재시도 테스트 시작...');

  // 의도적으로 rate limit에 걸릴 때까지 빠르게 호출
  for (let i = 0; i < 100; i++) {
    const result = await api.createMessage(
      [{ role: 'user', content: `Test ${i}` }],
      { maxTokens: 10 },
    );

    if (!result.ok && result.error.code === 'api_rate_limit') {
      console.log(`요청 ${i}에서 rate limit 발생!`);
      console.log('ClaudeApi가 자동으로 재시도합니다...');

      // 재시도 후 성공하면 계속 진행
      if (result.ok) {
        console.log('재시도 성공!');
      }
    }
  }
}
```

### 예제 2: 타임아웃 처리

```typescript
/**
 * 타임아웃 시간 내에 응답받기
 */
async function askWithTimeout(
  api: ClaudeApi,
  question: string,
  timeoutMs: number,
): Promise<string | null> {
  const result = await api.createMessage(
    [{ role: 'user', content: question }],
    { timeoutMs },
  );

  if (!result.ok) {
    if (result.error.code === 'api_timeout') {
      console.error(`${timeoutMs}ms 내에 응답을 받지 못했습니다.`);
      return null;
    }
    console.error('에러:', result.error.message);
    return null;
  }

  return result.value.content;
}

// 사용 예:
const answer = await askWithTimeout(api, '복잡한 수학 문제 풀기', 30000);
if (answer) {
  console.log('답변:', answer);
}
```

### 예제 3: 실시간 스트리밍 + 토큰 카운팅

```typescript
/**
 * 스트리밍하면서 실시간으로 토큰 추정
 */
async function streamWithTokenCounting(
  api: ClaudeApi,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  let fullText = '';
  let estimatedTokens = 0;

  const result = await api.streamMessage(
    messages,
    (event) => {
      if (event.type === 'content_delta') {
        fullText += event.text;

        // 대략적인 토큰 추정 (영어: 4글자 ≈ 1토큰, 한글: 1.5글자 ≈ 1토큰)
        estimatedTokens = Math.ceil(fullText.length / 4);

        // 실시간 출력
        process.stdout.write(event.text);
        process.stdout.write(`\r[예상 토큰: ${estimatedTokens}]`);
      } else if (event.type === 'message_complete') {
        console.log(`\n\n실제 토큰: ${event.metadata.outputTokens}`);
        console.log(`예상과 실제 차이: ${Math.abs(estimatedTokens - event.metadata.outputTokens)}`);
      }
    },
  );

  if (!result.ok) {
    console.error('스트리밍 에러:', result.error.message);
  }
}
```

---

## 🐛 에러 나면 어떻게?

### 에러 코드 종류

ClaudeApi는 다음 에러를 반환합니다:

#### 1. `api_auth_error`
**원인:** API key가 없거나 만료됨

**해결:**
```typescript
const result = await api.createMessage(messages);
if (!result.ok && result.error.code === 'api_auth_error') {
  console.error('API key를 확인하세요:');
  console.error('1. .env 파일에 ANTHROPIC_API_KEY 설정');
  console.error('2. API key 유효성 확인');
  console.error('3. 권한 확인');
}
```

#### 2. `api_rate_limit`
**원인:** Rate limit 초과 (재시도 3회 후에도 실패)

**해결:**
```typescript
if (!result.ok && result.error.code === 'api_rate_limit') {
  console.error('Rate limit 초과!');
  console.error('해결 방법:');
  console.error('1. 잠시 대기 후 재시도');
  console.error('2. 요청 간격 늘리기');
  console.error('3. Tier 업그레이드 고려');

  // 1분 대기 후 재시도
  await new Promise(resolve => setTimeout(resolve, 60000));
  const retryResult = await api.createMessage(messages);
}
```

#### 3. `api_timeout`
**원인:** 타임아웃 시간 초과

**해결:**
```typescript
if (!result.ok && result.error.code === 'api_timeout') {
  console.error('타임아웃! 다음을 시도하세요:');
  console.error('1. timeoutMs 증가');
  console.error('2. maxTokens 감소 (짧은 답변 요청)');
  console.error('3. 질문 단순화');

  // 타임아웃 2배로 늘려서 재시도
  const retryResult = await api.createMessage(messages, {
    timeoutMs: 120000, // 60초 → 120초
  });
}
```

#### 4. `api_network_error`
**원인:** 네트워크 연결 실패

**해결:**
```typescript
if (!result.ok && result.error.code === 'api_network_error') {
  console.error('네트워크 에러:');
  console.error('1. 인터넷 연결 확인');
  console.error('2. 프록시 설정 확인');
  console.error('3. Anthropic 서버 상태 확인');
}
```

#### 5. `api_invalid_request`
**원인:** 잘못된 요청 (400 Bad Request)

**해결:**
```typescript
if (!result.ok && result.error.code === 'api_invalid_request') {
  console.error('잘못된 요청:');
  console.error('1. 메시지 형식 확인 (role, content 필수)');
  console.error('2. model 이름 확인');
  console.error('3. maxTokens 범위 확인 (1 ~ 4096)');
  console.error('4. temperature 범위 확인 (0.0 ~ 1.0)');
}
```

### 에러 처리 패턴

```typescript
async function safeApiCall(
  api: ClaudeApi,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxRetries = 3,
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await api.createMessage(messages);

    if (result.ok) {
      return result.value.content;
    }

    const { code, message } = result.error;
    console.error(`시도 ${attempt}/${maxRetries} 실패:`, message);

    // 재시도 가능한 에러인지 확인
    if (code === 'api_rate_limit' || code === 'api_network_error') {
      const waitTime = Math.pow(2, attempt) * 1000; // 지수 백오프
      console.log(`${waitTime}ms 대기 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    // 재시도 불가능한 에러
    if (code === 'api_auth_error' || code === 'api_invalid_request') {
      console.error('재시도 불가능한 에러입니다.');
      return null;
    }
  }

  console.error('최대 재시도 횟수 초과');
  return null;
}
```

---

## 📊 API 레퍼런스

### `ClaudeApi` 클래스

#### 생성자
```typescript
constructor(
  authProvider: AuthProvider,
  logger: Logger,
  retryPolicy?: RetryPolicy,
)
```

**매개변수:**
- `authProvider`: 인증 프로바이더 (API key / OAuth)
- `logger`: Logger 인스턴스
- `retryPolicy`: 재시도 정책 (기본값: 3회 재시도, 지수 백오프)

---

#### `createMessage()` 메서드 (비스트리밍)
```typescript
async createMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: ClaudeApiRequestOptions,
): Promise<Result<ClaudeApiResponse>>
```

**매개변수:**
- `messages`: 대화 메시지 배열
- `options`: 요청 옵션
  - `model`: 모델 이름 (기본: 'claude-opus-4-20250514')
  - `maxTokens`: 최대 출력 토큰 (기본: 4096)
  - `temperature`: 온도 0.0~1.0 (기본: 1.0)
  - `timeoutMs`: 타임아웃 밀리초 (기본: 60000)

**반환값:**
- 성공 시: `ClaudeApiResponse` (content, metadata)
- 실패 시: `AgentError`

---

#### `streamMessage()` 메서드 (스트리밍)
```typescript
async streamMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onEvent: StreamCallback,
  options?: ClaudeApiRequestOptions,
): Promise<Result<void>>
```

**매개변수:**
- `messages`: 대화 메시지 배열
- `onEvent`: 스트리밍 이벤트 콜백
- `options`: 요청 옵션

**반환값:**
- 성공 시: `ok(void)`
- 실패 시: `AgentError`

---

### `ClaudeApiRequestOptions` 인터페이스

```typescript
interface ClaudeApiRequestOptions {
  model?: string;         // 모델 이름
  maxTokens?: number;     // 최대 출력 토큰
  temperature?: number;   // 온도 (0.0~1.0)
  timeoutMs?: number;     // 타임아웃 (밀리초)
}
```

---

### `ClaudeApiResponse` 인터페이스

```typescript
interface ClaudeApiResponse {
  content: string;                      // 응답 텍스트
  metadata: ClaudeApiResponseMetadata;  // 메타데이터
}

interface ClaudeApiResponseMetadata {
  model: string;          // 사용된 모델
  inputTokens: number;    // 입력 토큰 수
  outputTokens: number;   // 출력 토큰 수
  stopReason: string;     // 중단 이유
}
```

---

### `ClaudeStreamEvent` 타입

```typescript
type ClaudeStreamEvent =
  | { type: 'content_start' }                                    // 시작
  | { type: 'content_delta'; text: string }                      // 텍스트 조각
  | { type: 'content_stop' }                                     // 종료
  | { type: 'message_complete'; metadata: ClaudeApiResponseMetadata };  // 완료
```

---

## 🎓 고급 사용법

### 1. 커스텀 재시도 정책

```typescript
import type { RetryPolicy } from '../core/errors.js';

// 커스텀 재시도 정책 (5회 재시도, 초기 대기 2초)
const customRetryPolicy: RetryPolicy = {
  maxRetries: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const api = new ClaudeApi(authProvider, logger, customRetryPolicy);
```

### 2. OAuth 토큰 인증

```typescript
import { SubscriptionAuthProvider } from '../auth/subscription-auth.js';

// OAuth 토큰 사용
const authProvider = new SubscriptionAuthProvider(
  'oauth-token-here',
  logger,
);

const api = new ClaudeApi(authProvider, logger);
```

### 3. 토큰 사용량 추적

```typescript
let totalInputTokens = 0;
let totalOutputTokens = 0;

async function trackTokenUsage(
  api: ClaudeApi,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  const result = await api.createMessage(messages);

  if (result.ok) {
    totalInputTokens += result.value.metadata.inputTokens;
    totalOutputTokens += result.value.metadata.outputTokens;

    console.log('누적 토큰:', {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: totalInputTokens + totalOutputTokens,
    });
  }
}
```

### 4. 병렬 요청 (독립적인 질문들)

```typescript
// 여러 독립적인 질문을 병렬로 처리
const questions = [
  'What is 2+2?',
  'What is the capital of France?',
  'Who wrote Hamlet?',
];

const results = await Promise.all(
  questions.map(q =>
    api.createMessage([{ role: 'user', content: q }]),
  ),
);

results.forEach((result, idx) => {
  if (result.ok) {
    console.log(`Q${idx + 1}:`, questions[idx]);
    console.log(`A${idx + 1}:`, result.value.content);
  }
});
```

---

## 🔗 관련 모듈

- **AuthProvider** (`src/auth/types.ts`) - API key / OAuth 인증
- **Logger** (`src/core/logger.ts`) - 로깅
- **Result 패턴** (`src/core/types.ts`) - 에러 처리
- **AgentError** (`src/core/errors.ts`) - 에러 타입
- **ProcessExecutor** (`src/core/process-executor.ts`) - 외부 프로세스 실행

---

## ✅ 체크리스트

ClaudeApi를 사용하기 전에:
- [ ] @anthropic-ai/sdk 패키지가 설치되어 있나요?
- [ ] API key 또는 OAuth 토큰이 설정되어 있나요?
- [ ] AuthProvider를 올바르게 생성했나요?
- [ ] 타임아웃이 작업에 충분히 긴가요?
- [ ] maxTokens가 예상 답변 길이에 충분한가요?
- [ ] Result 패턴으로 에러 처리를 했나요?
- [ ] 스트리밍 사용 시 모든 이벤트 타입을 처리했나요?

---

**마지막 업데이트:** 2026-03-04
**작성자:** documenter 에이전트
**Architect 점수:** 99/100
**Reviewer 점수:** 97/100
**참조 코드:** src/layer1/claude-api.ts (520줄)
