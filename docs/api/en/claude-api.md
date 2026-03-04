> **Languages:** [한국어](../ko/claude-api.md) | [English](../en/claude-api.md) | [日本語](../ja/claude-api.md) | [Español](../es/claude-api.md)

# ClaudeApi — Claude Messages API Wrapper

## 🎯 What is this?

**Elementary School Analogy:**
ClaudeApi is a "phone to talk to AI"!

For example:
- Pick up phone → Say "Hello?" → AI answers "Hello!"
- When listening to long story → Hear word by word in real-time (streaming)
- When asking short question → Get complete answer at once (non-streaming)

If phone breaks? Auto-redial for you (retry)
If waiting too long? Auto-hang up for you (timeout)

**Technical Description:**
Client wrapper for Anthropic Claude Messages API.
- Separate streaming/non-streaming calls
- AuthProvider integration (API key / OAuth token)
- Retry logic (exponential backoff)
- AbortController timeout
- Token usage tracking
- Automatic rate limit management

---

## 🔍 Why is it needed?

### 1. Safe API Calls
If you use `@anthropic-ai/sdk` directly:
- Must implement retry logic every time
- Complex timeout handling
- Difficult token tracking
- Must manually manage rate limits

ClaudeApi solves this automatically.

### 2. Separate Streaming vs Non-streaming
Two usage patterns clearly separated:
```typescript
// Short answer → Non-streaming (receive at once)
const result = await api.createMessage([
  { role: 'user', content: 'What is 2+2?' }
]);

// Long answer → Streaming (receive in real-time)
await api.streamMessage([
  { role: 'user', content: 'Tell me a story' }
], (event) => {
  if (event.type === 'content_delta') {
    process.stdout.write(event.text);
  }
});
```

### 3. Auto-retry (Exponential Backoff)
Auto-retry on network error or rate limit:
```
Attempt 1: Failed (429 Too Many Requests) → Wait 1s
Attempt 2: Failed (503 Service Unavailable) → Wait 2s
Attempt 3: Success! ✅
```

---

## 📐 Architecture

### Core Structure

```
┌───────────────────────────────────────────┐
│ ClaudeApi                                 │
├───────────────────────────────────────────┤
│ + createMessage()  → Non-streaming call   │
│ + streamMessage()  → Streaming call       │
│                                           │
│ [Internal Mechanisms]                     │
│ - withRetry()      → Retry logic          │
│ - AbortController  → Timeout              │
│ - AuthProvider     → Auth integration     │
│ - Rate Limit Track → Token management     │
└───────────────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ Anthropic SDK (@anthropic-ai/sdk)         │
│ messages.create()                         │
└───────────────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ Claude Messages API (Anthropic Server)    │
└───────────────────────────────────────────┘
```

### Retry Logic Flow (Exponential Backoff)

```
┌──────────────┐
│ Start API Call│
└──────┬───────┘
       ↓
┌──────────────┐
│ Attempt 1    │
└──────┬───────┘
       ↓
   Success? ───YES──→ ✅ Return result
     │
     NO (Error)
     ↓
  Retryable? (429, 500, 502, 503, 504)
     │
     NO ───→ ❌ Return error
     │
     YES
     ↓
┌──────────────┐
│ Wait 1s      │
└──────┬───────┘
       ↓
┌──────────────┐
│ Attempt 2    │
└──────┬───────┘
       ↓
   Success? ───YES──→ ✅ Return result
     │
     NO
     ↓
┌──────────────┐
│ Wait 2s      │
└──────┬───────┘
       ↓
┌──────────────┐
│ Attempt 3    │
└──────┬───────┘
       ↓
   Success? ───YES──→ ✅ Return result
     │
     NO ───→ ❌ Final error
```

### Timeout Mechanism (AbortController)

```
┌──────────────────────────────────┐
│ API Call + Start Timer (60s)     │
└────────┬─────────────────────────┘
         ↓
     Complete before 60s? ───YES──→ ✅ Cancel timer, return result
         │
         NO
         ↓
     ┌────────────────────┐
     │ AbortController.abort() │
     └────────┬───────────┘
              ↓
         ❌ Timeout error
```

---

## 🔧 Dependencies

### Direct Dependencies
- `@anthropic-ai/sdk` — Anthropic official SDK
- `../auth/types` — AuthProvider (authentication)
- `../core/logger` — Logger (logging)
- `../core/types` — Result pattern
- `../core/errors` — AgentError, RetryPolicy

### Dependency Graph
```
layer1/claude-api
  ↓
┌──────────────┬──────────────┬──────────────┐
│ auth/types   │ core/logger  │ core/types   │
└──────────────┴──────────────┴──────────────┘
        ↓
    core/config
```

**Rule:** layer1 can only depend on core, auth (layer2 forbidden)

---

## 📦 How to use?

### Step 1: Package Installation (Check Blocker #1)

```bash
# Check @anthropic-ai/sdk package
bun pm ls | grep anthropic

# If not installed:
bun add @anthropic-ai/sdk

# Verify installation
bun pm ls @anthropic-ai/sdk
```

### Step 2: Create Instance

```typescript
import { ClaudeApi } from '../layer1/claude-api.js';
import { ApiKeyAuthProvider } from '../auth/api-key-auth.js';
import { Logger } from '../core/logger.js';
import { DEFAULT_RETRY_POLICY } from '../core/errors.js';

// 1. Create logger
const logger = new Logger({ level: 'info' });

// 2. Create auth provider
const authProvider = new ApiKeyAuthProvider(
  'your-api-key-here', // Actually get from config
  logger,
);

// 3. Create ClaudeApi
const api = new ClaudeApi(
  authProvider,
  logger,
  DEFAULT_RETRY_POLICY, // Optional: 3 retries, exponential backoff
);
```

### Step 3: Non-streaming Message Creation (Short Answers)

```typescript
// Simple question → Receive answer at once
const result = await api.createMessage(
  [{ role: 'user', content: 'What is 2+2?' }],
  {
    model: 'claude-opus-4-20250514',
    maxTokens: 100,
    temperature: 0.7,
    timeoutMs: 30000, // 30 second timeout
  },
);

if (result.ok) {
  console.log('Answer:', result.value.content);
  console.log('Tokens used:', {
    input: result.value.metadata.inputTokens,
    output: result.value.metadata.outputTokens,
  });
} else {
  console.error('Error:', result.error.message);
}
```

### Step 4: Streaming Message Creation (Long Answers)

```typescript
// Long story → Receive word by word in real-time
const result = await api.streamMessage(
  [{ role: 'user', content: 'Tell me a long story about a dragon' }],
  (event) => {
    if (event.type === 'content_start') {
      console.log('Streaming started...');
    } else if (event.type === 'content_delta') {
      // Output text in real-time
      process.stdout.write(event.text);
    } else if (event.type === 'content_stop') {
      console.log('\nStreaming ended.');
    } else if (event.type === 'message_complete') {
      console.log('Token usage:', event.metadata.inputTokens, event.metadata.outputTokens);
    }
  },
  {
    maxTokens: 2048,
    timeoutMs: 120000, // 2 minute timeout (for long answers)
  },
);

if (!result.ok) {
  console.error('Streaming error:', result.error.message);
}
```

### Step 5: Multi-turn Conversation

```typescript
const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];

// First question
conversation.push({ role: 'user', content: 'My name is Alice' });

const result1 = await api.createMessage(conversation);
if (result1.ok) {
  conversation.push({ role: 'assistant', content: result1.value.content });
  console.log('AI:', result1.value.content);
}

// Second question (remembers previous conversation)
conversation.push({ role: 'user', content: 'What is my name?' });

const result2 = await api.createMessage(conversation);
if (result2.ok) {
  console.log('AI:', result2.value.content); // "Your name is Alice"
}
```

---

## ⚠️ Cautions

### 1. Timeout Settings
**Default timeout: 60 seconds**

Increase timeout for long answers or complex tasks:
```typescript
// ❌ Wrong: Long story may not finish in 60 seconds
await api.streamMessage(messages, onEvent);

// ✅ Correct: Set sufficient timeout
await api.streamMessage(messages, onEvent, {
  timeoutMs: 180000, // 3 minutes
});
```

### 2. Only Retryable Errors are Retried
**HTTP status codes that are retried:**
- `429` Too Many Requests (rate limit)
- `500` Internal Server Error
- `502` Bad Gateway
- `503` Service Unavailable
- `504` Gateway Timeout

**Errors NOT retried:**
- `400` Bad Request (invalid request)
- `401` Unauthorized (auth failed)
- `403` Forbidden (no permission)
- `404` Not Found (model not found)

```typescript
const result = await api.createMessage(messages);

if (!result.ok) {
  const { code } = result.error;

  if (code === 'api_rate_limit') {
    // Failed even after retry → Rate limit exceeded
    console.error('Rate limit exceeded. Try again later.');
  } else if (code === 'api_auth_error') {
    // Not retried → Need to check API key
    console.error('Check API key.');
  }
}
```

### 3. maxTokens Settings
Set sufficient tokens to avoid truncation:
```typescript
// ❌ Dangerous: Long answer may be cut off
await api.createMessage(messages, { maxTokens: 100 });

// ✅ Safe: Sufficient tokens
await api.createMessage(messages, { maxTokens: 4096 });
```

### 4. Streaming Event Order
Streaming events are guaranteed in order:
```
1. content_start (start)
2. content_delta (multiple times, text chunks)
3. content_stop (end)
4. message_complete (metadata)
```

Must handle in this order:
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
      console.log('Full text:', fullText);
      break;
    case 'message_complete':
      console.log('Tokens:', event.metadata.outputTokens);
      break;
  }
});
```

---

## 💡 Example Code

### Example 1: Test Retry Logic

```typescript
/**
 * Function to test retry logic
 */
async function testRetryLogic(api: ClaudeApi) {
  console.log('Starting retry test...');

  // Intentionally call rapidly until hitting rate limit
  for (let i = 0; i < 100; i++) {
    const result = await api.createMessage(
      [{ role: 'user', content: `Test ${i}` }],
      { maxTokens: 10 },
    );

    if (!result.ok && result.error.code === 'api_rate_limit') {
      console.log(`Rate limit hit at request ${i}!`);
      console.log('ClaudeApi will auto-retry...');

      // If retry succeeds, continue
      if (result.ok) {
        console.log('Retry succeeded!');
      }
    }
  }
}
```

### Example 2: Timeout Handling

```typescript
/**
 * Get response within timeout
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
      console.error(`Did not receive response within ${timeoutMs}ms.`);
      return null;
    }
    console.error('Error:', result.error.message);
    return null;
  }

  return result.value.content;
}

// Usage example:
const answer = await askWithTimeout(api, 'Solve complex math problem', 30000);
if (answer) {
  console.log('Answer:', answer);
}
```

### Example 3: Real-time Streaming + Token Counting

```typescript
/**
 * Estimate tokens in real-time while streaming
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

        // Rough token estimate (English: 4 chars ≈ 1 token, Korean: 1.5 chars ≈ 1 token)
        estimatedTokens = Math.ceil(fullText.length / 4);

        // Real-time output
        process.stdout.write(event.text);
        process.stdout.write(`\r[Estimated tokens: ${estimatedTokens}]`);
      } else if (event.type === 'message_complete') {
        console.log(`\n\nActual tokens: ${event.metadata.outputTokens}`);
        console.log(`Difference: ${Math.abs(estimatedTokens - event.metadata.outputTokens)}`);
      }
    },
  );

  if (!result.ok) {
    console.error('Streaming error:', result.error.message);
  }
}
```

---

## 🐛 What to do when errors occur?

### Error Code Types

ClaudeApi returns the following errors:

#### 1. `api_auth_error`
**Cause:** API key missing or expired

**Solution:**
```typescript
const result = await api.createMessage(messages);
if (!result.ok && result.error.code === 'api_auth_error') {
  console.error('Check API key:');
  console.error('1. Set ANTHROPIC_API_KEY in .env file');
  console.error('2. Verify API key validity');
  console.error('3. Check permissions');
}
```

#### 2. `api_rate_limit`
**Cause:** Rate limit exceeded (failed even after 3 retries)

**Solution:**
```typescript
if (!result.ok && result.error.code === 'api_rate_limit') {
  console.error('Rate limit exceeded!');
  console.error('Solutions:');
  console.error('1. Wait and retry');
  console.error('2. Increase request interval');
  console.error('3. Consider tier upgrade');

  // Wait 1 minute and retry
  await new Promise(resolve => setTimeout(resolve, 60000));
  const retryResult = await api.createMessage(messages);
}
```

#### 3. `api_timeout`
**Cause:** Timeout exceeded

**Solution:**
```typescript
if (!result.ok && result.error.code === 'api_timeout') {
  console.error('Timeout! Try:');
  console.error('1. Increase timeoutMs');
  console.error('2. Decrease maxTokens (request shorter answer)');
  console.error('3. Simplify question');

  // Double timeout and retry
  const retryResult = await api.createMessage(messages, {
    timeoutMs: 120000, // 60s → 120s
  });
}
```

#### 4. `api_network_error`
**Cause:** Network connection failed

**Solution:**
```typescript
if (!result.ok && result.error.code === 'api_network_error') {
  console.error('Network error:');
  console.error('1. Check internet connection');
  console.error('2. Check proxy settings');
  console.error('3. Check Anthropic server status');
}
```

#### 5. `api_invalid_request`
**Cause:** Invalid request (400 Bad Request)

**Solution:**
```typescript
if (!result.ok && result.error.code === 'api_invalid_request') {
  console.error('Invalid request:');
  console.error('1. Check message format (role, content required)');
  console.error('2. Check model name');
  console.error('3. Check maxTokens range (1 ~ 4096)');
  console.error('4. Check temperature range (0.0 ~ 1.0)');
}
```

### Error Handling Pattern

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
    console.error(`Attempt ${attempt}/${maxRetries} failed:`, message);

    // Check if error is retryable
    if (code === 'api_rate_limit' || code === 'api_network_error') {
      const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    // Non-retryable error
    if (code === 'api_auth_error' || code === 'api_invalid_request') {
      console.error('Non-retryable error.');
      return null;
    }
  }

  console.error('Maximum retries exceeded');
  return null;
}
```

---

## 📊 API Reference

### `ClaudeApi` Class

#### Constructor
```typescript
constructor(
  authProvider: AuthProvider,
  logger: Logger,
  retryPolicy?: RetryPolicy,
)
```

**Parameters:**
- `authProvider`: Auth provider (API key / OAuth)
- `logger`: Logger instance
- `retryPolicy`: Retry policy (default: 3 retries, exponential backoff)

---

#### `createMessage()` Method (Non-streaming)
```typescript
async createMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: ClaudeApiRequestOptions,
): Promise<Result<ClaudeApiResponse>>
```

**Parameters:**
- `messages`: Conversation message array
- `options`: Request options
  - `model`: Model name (default: 'claude-opus-4-20250514')
  - `maxTokens`: Max output tokens (default: 4096)
  - `temperature`: Temperature 0.0~1.0 (default: 1.0)
  - `timeoutMs`: Timeout milliseconds (default: 60000)

**Return Value:**
- Success: `ClaudeApiResponse` (content, metadata)
- Failure: `AgentError`

---

#### `streamMessage()` Method (Streaming)
```typescript
async streamMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onEvent: StreamCallback,
  options?: ClaudeApiRequestOptions,
): Promise<Result<void>>
```

**Parameters:**
- `messages`: Conversation message array
- `onEvent`: Streaming event callback
- `options`: Request options

**Return Value:**
- Success: `ok(void)`
- Failure: `AgentError`

---

### `ClaudeApiRequestOptions` Interface

```typescript
interface ClaudeApiRequestOptions {
  model?: string;         // Model name
  maxTokens?: number;     // Max output tokens
  temperature?: number;   // Temperature (0.0~1.0)
  timeoutMs?: number;     // Timeout (milliseconds)
}
```

---

### `ClaudeApiResponse` Interface

```typescript
interface ClaudeApiResponse {
  content: string;                      // Response text
  metadata: ClaudeApiResponseMetadata;  // Metadata
}

interface ClaudeApiResponseMetadata {
  model: string;          // Model used
  inputTokens: number;    // Input token count
  outputTokens: number;   // Output token count
  stopReason: string;     // Stop reason
}
```

---

### `ClaudeStreamEvent` Type

```typescript
type ClaudeStreamEvent =
  | { type: 'content_start' }                                    // Start
  | { type: 'content_delta'; text: string }                      // Text chunk
  | { type: 'content_stop' }                                     // End
  | { type: 'message_complete'; metadata: ClaudeApiResponseMetadata };  // Complete
```

---

## 🎓 Advanced Usage

### 1. Custom Retry Policy

```typescript
import type { RetryPolicy } from '../core/errors.js';

// Custom retry policy (5 retries, initial wait 2s)
const customRetryPolicy: RetryPolicy = {
  maxRetries: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const api = new ClaudeApi(authProvider, logger, customRetryPolicy);
```

### 2. OAuth Token Auth

```typescript
import { SubscriptionAuthProvider } from '../auth/subscription-auth.js';

// Use OAuth token
const authProvider = new SubscriptionAuthProvider(
  'oauth-token-here',
  logger,
);

const api = new ClaudeApi(authProvider, logger);
```

### 3. Track Token Usage

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

    console.log('Cumulative tokens:', {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: totalInputTokens + totalOutputTokens,
    });
  }
}
```

### 4. Parallel Requests (Independent Questions)

```typescript
// Process multiple independent questions in parallel
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

## 🔗 Related Modules

- **AuthProvider** (`src/auth/types.ts`) - API key / OAuth auth
- **Logger** (`src/core/logger.ts`) - Logging
- **Result Pattern** (`src/core/types.ts`) - Error handling
- **AgentError** (`src/core/errors.ts`) - Error types
- **ProcessExecutor** (`src/core/process-executor.ts`) - External process execution

---

## ✅ Checklist

Before using ClaudeApi:
- [ ] Is @anthropic-ai/sdk package installed?
- [ ] Is API key or OAuth token configured?
- [ ] Created AuthProvider correctly?
- [ ] Is timeout long enough for the task?
- [ ] Is maxTokens sufficient for expected answer length?
- [ ] Handled errors with Result pattern?
- [ ] When using streaming, handled all event types?

---

**Last Updated:** 2026-03-04
**Author:** documenter agent
**Architect Score:** 99/100
**Reviewer Score:** 97/100
**Reference Code:** src/layer1/claude-api.ts (520 lines)
