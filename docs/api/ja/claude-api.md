> **Languages:** [한국어](../ko/claude-api.md) | [English](../en/claude-api.md) | [日本語](../ja/claude-api.md) | [Español](../es/claude-api.md)

# ClaudeApi — Claude Messages API ラッパー

## 🎯 これは何ですか?

**小学生向けの例え:**
ClaudeApiは「AIと会話する電話機」です!

例えば:
- 電話を持って → "こんにちは?" と言うと → AIが "こんにちは!" と答える
- 長い話を聞くとき → リアルタイムで一言ずつ聞こえる (ストリーミング)
- 短い質問のとき → 答えを全部聞いてから一度に受け取る (非ストリーミング)

電話が壊れたら? 自動的にかけ直してくれます (再試行)
待ちすぎたら? 自動的に切ってくれます (タイムアウト)

**技術説明:**
Anthropic Claude Messages APIをラップしたクライアントです。
- ストリーミング/非ストリーミング呼び出し分離
- AuthProvider統合 (API key / OAuth トークン)
- 再試行ロジック (指数バックオフ)
- AbortControllerタイムアウト
- トークン使用量追跡
- Rate limit自動管理

---

## 🔍 なぜ必要ですか?

### 1. 安全なAPI呼び出し
直接`@anthropic-ai/sdk`を使うと:
- 再試行ロジックを毎回実装する必要がある
- タイムアウト処理が複雑
- トークン追跡が難しい
- Rate limit管理を直接行う必要がある

ClaudeApiはこれを自動的に解決します。

### 2. ストリーミング vs 非ストリーミング分離
2つの使用パターンを明確に分離:
```typescript
// 短い答え → 非ストリーミング (一度に受け取る)
const result = await api.createMessage([
  { role: 'user', content: 'What is 2+2?' }
]);

// 長い答え → ストリーミング (リアルタイムで受け取る)
await api.streamMessage([
  { role: 'user', content: 'Tell me a story' }
], (event) => {
  if (event.type === 'content_delta') {
    process.stdout.write(event.text);
  }
});
```

### 3. 自動再試行 (指数バックオフ)
ネットワークエラーやrate limit発生時に自動再試行:
```
試行1: 失敗 (429 Too Many Requests) → 1秒待機
試行2: 失敗 (503 Service Unavailable) → 2秒待機
試行3: 成功! ✅
```

---

## 📐 アーキテクチャ

### コア構造

```
┌───────────────────────────────────────────┐
│ ClaudeApi                                 │
├───────────────────────────────────────────┤
│ + createMessage()  → 非ストリーミング呼出│
│ + streamMessage()  → ストリーミング呼出  │
│                                           │
│ [内部メカニズム]                          │
│ - withRetry()      → 再試行ロジック      │
│ - AbortController  → タイムアウト        │
│ - AuthProvider     → 認証統合            │
│ - Rate Limit追跡   → トークン管理        │
└───────────────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ Anthropic SDK (@anthropic-ai/sdk)         │
│ messages.create()                         │
└───────────────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ Claude Messages API (Anthropicサーバー)   │
└───────────────────────────────────────────┘
```

### 再試行ロジック流れ (指数バックオフ)

```
┌──────────────┐
│ API呼び出し開始│
└──────┬───────┘
       ↓
┌──────────────┐
│ 試行1        │
└──────┬───────┘
       ↓
   成功? ───YES──→ ✅ 結果返却
     │
     NO (エラー)
     ↓
  再試行可能? (429, 500, 502, 503, 504)
     │
     NO ───→ ❌ エラー返却
     │
     YES
     ↓
┌──────────────┐
│ 1秒待機      │
└──────┬───────┘
       ↓
┌──────────────┐
│ 試行2        │
└──────┬───────┘
       ↓
   成功? ───YES──→ ✅ 結果返却
     │
     NO
     ↓
┌──────────────┐
│ 2秒待機      │
└──────┬───────┘
       ↓
┌──────────────┐
│ 試行3        │
└──────┬───────┘
       ↓
   成功? ───YES──→ ✅ 結果返却
     │
     NO ───→ ❌ 最終エラー返却
```

### タイムアウトメカニズム (AbortController)

```
┌──────────────────────────────────┐
│ API呼び出し + タイマー開始 (60秒) │
└────────┬─────────────────────────┘
         ↓
     60秒前完了? ───YES──→ ✅ タイマーキャンセル、結果返却
         │
         NO
         ↓
     ┌────────────────────┐
     │ AbortController.abort() │
     └────────┬───────────┘
              ↓
         ❌ タイムアウトエラー
```

---

## 🔧 依存性

### 直接依存性
- `@anthropic-ai/sdk` — Anthropic公式SDK
- `../auth/types` — AuthProvider (認証)
- `../core/logger` — Logger (ログ)
- `../core/types` — Result パターン
- `../core/errors` — AgentError, RetryPolicy

### 依存性グラフ
```
layer1/claude-api
  ↓
┌──────────────┬──────────────┬──────────────┐
│ auth/types   │ core/logger  │ core/types   │
└──────────────┴──────────────┴──────────────┘
        ↓
    core/config
```

**ルール:** layer1はcore、authにのみ依存可能 (layer2禁止)

---

## 📦 使い方

### ステップ 1: パッケージインストール (Blocker #1確認)

```bash
# @anthropic-ai/sdk パッケージ確認
bun pm ls | grep anthropic

# インストールされていなければ:
bun add @anthropic-ai/sdk

# インストール確認
bun pm ls @anthropic-ai/sdk
```

### ステップ 2: インスタンス生成

```typescript
import { ClaudeApi } from '../layer1/claude-api.js';
import { ApiKeyAuthProvider } from '../auth/api-key-auth.js';
import { Logger } from '../core/logger.js';
import { DEFAULT_RETRY_POLICY } from '../core/errors.js';

// 1. ロガー生成
const logger = new Logger({ level: 'info' });

// 2. 認証プロバイダ生成
const authProvider = new ApiKeyAuthProvider(
  'your-api-key-here', // 実際にはconfigから取得
  logger,
);

// 3. ClaudeApi生成
const api = new ClaudeApi(
  authProvider,
  logger,
  DEFAULT_RETRY_POLICY, // 選択: 再試行3回、指数バックオフ
);
```

### ステップ 3: 非ストリーミングメッセージ生成 (短い答え)

```typescript
// 簡単な質問 → 答えを一度に受け取る
const result = await api.createMessage(
  [{ role: 'user', content: 'What is 2+2?' }],
  {
    model: 'claude-opus-4-20250514',
    maxTokens: 100,
    temperature: 0.7,
    timeoutMs: 30000, // 30秒タイムアウト
  },
);

if (result.ok) {
  console.log('答え:', result.value.content);
  console.log('使用トークン:', {
    input: result.value.metadata.inputTokens,
    output: result.value.metadata.outputTokens,
  });
} else {
  console.error('エラー:', result.error.message);
}
```

### ステップ 4: ストリーミングメッセージ生成 (長い答え)

```typescript
// 長い話 → リアルタイムで一言ずつ受け取る
const result = await api.streamMessage(
  [{ role: 'user', content: 'Tell me a long story about a dragon' }],
  (event) => {
    if (event.type === 'content_start') {
      console.log('ストリーミング開始...');
    } else if (event.type === 'content_delta') {
      // リアルタイムでテキスト出力
      process.stdout.write(event.text);
    } else if (event.type === 'content_stop') {
      console.log('\nストリーミング終了。');
    } else if (event.type === 'message_complete') {
      console.log('トークン使用:', event.metadata.inputTokens, event.metadata.outputTokens);
    }
  },
  {
    maxTokens: 2048,
    timeoutMs: 120000, // 2分タイムアウト (長い答え用)
  },
);

if (!result.ok) {
  console.error('ストリーミングエラー:', result.error.message);
}
```

### ステップ 5: マルチターン会話

```typescript
const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];

// 最初の質問
conversation.push({ role: 'user', content: 'My name is Alice' });

const result1 = await api.createMessage(conversation);
if (result1.ok) {
  conversation.push({ role: 'assistant', content: result1.value.content });
  console.log('AI:', result1.value.content);
}

// 2番目の質問 (以前の会話を覚えている)
conversation.push({ role: 'user', content: 'What is my name?' });

const result2 = await api.createMessage(conversation);
if (result2.ok) {
  console.log('AI:', result2.value.content); // "Your name is Alice"
}
```

---

## ⚠️ 注意点

### 1. タイムアウト設定
**デフォルトタイムアウト: 60秒**

長い答えや複雑な作業はタイムアウトを増やしてください:
```typescript
// ❌ 間違った例: 長い話は60秒で終わらない可能性がある
await api.streamMessage(messages, onEvent);

// ✅ 正しい例: 十分なタイムアウト設定
await api.streamMessage(messages, onEvent, {
  timeoutMs: 180000, // 3分
});
```

### 2. 再試行可能なエラーのみ再試行
**再試行されるHTTPステータスコード:**
- `429` Too Many Requests (rate limit)
- `500` Internal Server Error
- `502` Bad Gateway
- `503` Service Unavailable
- `504` Gateway Timeout

**再試行されないエラー:**
- `400` Bad Request (間違ったリクエスト)
- `401` Unauthorized (認証失敗)
- `403` Forbidden (権限なし)
- `404` Not Found (モデルなし)

```typescript
const result = await api.createMessage(messages);

if (!result.ok) {
  const { code } = result.error;

  if (code === 'api_rate_limit') {
    // 再試行後も失敗 → rate limit超過
    console.error('Rate limit超過。しばらくしてから再試行してください。');
  } else if (code === 'api_auth_error') {
    // 再試行しない → API key確認必要
    console.error('API keyを確認してください。');
  }
}
```

### 3. maxTokens設定
出力が切れないように十分なトークン設定:
```typescript
// ❌ 危険: 長い答えが切れる可能性がある
await api.createMessage(messages, { maxTokens: 100 });

// ✅ 安全: 十分なトークン
await api.createMessage(messages, { maxTokens: 4096 });
```

### 4. ストリーミングイベント順序
ストリーミングイベントは順序が保証されます:
```
1. content_start (開始)
2. content_delta (複数回、テキスト断片)
3. content_stop (終了)
4. message_complete (メタデータ)
```

必ずこの順序で処理してください:
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
      console.log('全テキスト:', fullText);
      break;
    case 'message_complete':
      console.log('トークン:', event.metadata.outputTokens);
      break;
  }
});
```

---

## 💡 例コード

### 例 1: 再試行ロジック体験

```typescript
/**
 * 再試行ロジックをテストする関数
 */
async function testRetryLogic(api: ClaudeApi) {
  console.log('再試行テスト開始...');

  // 意図的にrate limitにかかるまで速く呼び出す
  for (let i = 0; i < 100; i++) {
    const result = await api.createMessage(
      [{ role: 'user', content: `Test ${i}` }],
      { maxTokens: 10 },
    );

    if (!result.ok && result.error.code === 'api_rate_limit') {
      console.log(`リクエスト${i}でrate limit発生!`);
      console.log('ClaudeApiが自動的に再試行します...');

      // 再試行後に成功したら続行
      if (result.ok) {
        console.log('再試行成功!');
      }
    }
  }
}
```

### 例 2: タイムアウト処理

```typescript
/**
 * タイムアウト時間内に応答を受け取る
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
      console.error(`${timeoutMs}ms内に応答を受け取れませんでした。`);
      return null;
    }
    console.error('エラー:', result.error.message);
    return null;
  }

  return result.value.content;
}

// 使用例:
const answer = await askWithTimeout(api, '複雑な数学問題を解く', 30000);
if (answer) {
  console.log('答え:', answer);
}
```

### 例 3: リアルタイムストリーミング + トークンカウント

```typescript
/**
 * ストリーミングしながらリアルタイムでトークンを推定
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

        // 大まかなトークン推定 (英語: 4文字 ≈ 1トークン、日本語: 1.5文字 ≈ 1トークン)
        estimatedTokens = Math.ceil(fullText.length / 4);

        // リアルタイム出力
        process.stdout.write(event.text);
        process.stdout.write(`\r[予想トークン: ${estimatedTokens}]`);
      } else if (event.type === 'message_complete') {
        console.log(`\n\n実際のトークン: ${event.metadata.outputTokens}`);
        console.log(`予想と実際の差: ${Math.abs(estimatedTokens - event.metadata.outputTokens)}`);
      }
    },
  );

  if (!result.ok) {
    console.error('ストリーミングエラー:', result.error.message);
  }
}
```

---

## 🐛 エラー対処

### エラーコード種類

ClaudeApiは以下のエラーを返します:

#### 1. `api_auth_error`
**原因:** API keyがないか期限切れ

**解決:**
```typescript
const result = await api.createMessage(messages);
if (!result.ok && result.error.code === 'api_auth_error') {
  console.error('API keyを確認してください:');
  console.error('1. .envファイルにANTHROPIC_API_KEY設定');
  console.error('2. API key有効性確認');
  console.error('3. 権限確認');
}
```

#### 2. `api_rate_limit`
**原因:** Rate limit超過 (再試行3回後も失敗)

**解決:**
```typescript
if (!result.ok && result.error.code === 'api_rate_limit') {
  console.error('Rate limit超過!');
  console.error('解決方法:');
  console.error('1. しばらく待ってから再試行');
  console.error('2. リクエスト間隔を増やす');
  console.error('3. Tierアップグレードを検討');

  // 1分待ってから再試行
  await new Promise(resolve => setTimeout(resolve, 60000));
  const retryResult = await api.createMessage(messages);
}
```

#### 3. `api_timeout`
**原因:** タイムアウト時間超過

**解決:**
```typescript
if (!result.ok && result.error.code === 'api_timeout') {
  console.error('タイムアウト! 次を試してください:');
  console.error('1. timeoutMs増加');
  console.error('2. maxTokens減少 (短い答えをリクエスト)');
  console.error('3. 質問を簡単にする');

  // タイムアウトを2倍にして再試行
  const retryResult = await api.createMessage(messages, {
    timeoutMs: 120000, // 60秒 → 120秒
  });
}
```

#### 4. `api_network_error`
**原因:** ネットワーク接続失敗

**解決:**
```typescript
if (!result.ok && result.error.code === 'api_network_error') {
  console.error('ネットワークエラー:');
  console.error('1. インターネット接続確認');
  console.error('2. プロキシ設定確認');
  console.error('3. Anthropicサーバー状態確認');
}
```

#### 5. `api_invalid_request`
**原因:** 間違ったリクエスト (400 Bad Request)

**解決:**
```typescript
if (!result.ok && result.error.code === 'api_invalid_request') {
  console.error('間違ったリクエスト:');
  console.error('1. メッセージ形式確認 (role, content必須)');
  console.error('2. model名確認');
  console.error('3. maxTokens範囲確認 (1 ~ 4096)');
  console.error('4. temperature範囲確認 (0.0 ~ 1.0)');
}
```

### エラー処理パターン

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
    console.error(`試行 ${attempt}/${maxRetries} 失敗:`, message);

    // 再試行可能なエラーか確認
    if (code === 'api_rate_limit' || code === 'api_network_error') {
      const waitTime = Math.pow(2, attempt) * 1000; // 指数バックオフ
      console.log(`${waitTime}ms待機後に再試行...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    // 再試行不可能なエラー
    if (code === 'api_auth_error' || code === 'api_invalid_request') {
      console.error('再試行不可能なエラーです。');
      return null;
    }
  }

  console.error('最大再試行回数超過');
  return null;
}
```

---

## 📊 APIリファレンス

### `ClaudeApi` クラス

#### コンストラクタ
```typescript
constructor(
  authProvider: AuthProvider,
  logger: Logger,
  retryPolicy?: RetryPolicy,
)
```

**パラメータ:**
- `authProvider`: 認証プロバイダ (API key / OAuth)
- `logger`: Loggerインスタンス
- `retryPolicy`: 再試行ポリシー (デフォルト: 3回再試行、指数バックオフ)

---

#### `createMessage()` メソッド (非ストリーミング)
```typescript
async createMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: ClaudeApiRequestOptions,
): Promise<Result<ClaudeApiResponse>>
```

**パラメータ:**
- `messages`: 会話メッセージ配列
- `options`: リクエストオプション
  - `model`: モデル名 (デフォルト: 'claude-opus-4-20250514')
  - `maxTokens`: 最大出力トークン (デフォルト: 4096)
  - `temperature`: 温度 0.0~1.0 (デフォルト: 1.0)
  - `timeoutMs`: タイムアウトミリ秒 (デフォルト: 60000)

**戻り値:**
- 成功時: `ClaudeApiResponse` (content, metadata)
- 失敗時: `AgentError`

---

#### `streamMessage()` メソッド (ストリーミング)
```typescript
async streamMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onEvent: StreamCallback,
  options?: ClaudeApiRequestOptions,
): Promise<Result<void>>
```

**パラメータ:**
- `messages`: 会話メッセージ配列
- `onEvent`: ストリーミングイベントコールバック
- `options`: リクエストオプション

**戻り値:**
- 成功時: `ok(void)`
- 失敗時: `AgentError`

---

### `ClaudeApiRequestOptions` インターフェース

```typescript
interface ClaudeApiRequestOptions {
  model?: string;         // モデル名
  maxTokens?: number;     // 最大出力トークン
  temperature?: number;   // 温度 (0.0~1.0)
  timeoutMs?: number;     // タイムアウト (ミリ秒)
}
```

---

### `ClaudeApiResponse` インターフェース

```typescript
interface ClaudeApiResponse {
  content: string;                      // 応答テキスト
  metadata: ClaudeApiResponseMetadata;  // メタデータ
}

interface ClaudeApiResponseMetadata {
  model: string;          // 使用されたモデル
  inputTokens: number;    // 入力トークン数
  outputTokens: number;   // 出力トークン数
  stopReason: string;     // 中断理由
}
```

---

### `ClaudeStreamEvent` タイプ

```typescript
type ClaudeStreamEvent =
  | { type: 'content_start' }                                    // 開始
  | { type: 'content_delta'; text: string }                      // テキスト断片
  | { type: 'content_stop' }                                     // 終了
  | { type: 'message_complete'; metadata: ClaudeApiResponseMetadata };  // 完了
```

---

## 🎓 高度な使用法

### 1. カスタム再試行ポリシー

```typescript
import type { RetryPolicy } from '../core/errors.js';

// カスタム再試行ポリシー (5回再試行、初期待機2秒)
const customRetryPolicy: RetryPolicy = {
  maxRetries: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const api = new ClaudeApi(authProvider, logger, customRetryPolicy);
```

### 2. OAuthトークン認証

```typescript
import { SubscriptionAuthProvider } from '../auth/subscription-auth.js';

// OAuthトークン使用
const authProvider = new SubscriptionAuthProvider(
  'oauth-token-here',
  logger,
);

const api = new ClaudeApi(authProvider, logger);
```

### 3. トークン使用量追跡

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

    console.log('累積トークン:', {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: totalInputTokens + totalOutputTokens,
    });
  }
}
```

### 4. 並列リクエスト (独立した質問)

```typescript
// 複数の独立した質問を並列処理
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

## 🔗 関連モジュール

- **AuthProvider** (`src/auth/types.ts`) - API key / OAuth認証
- **Logger** (`src/core/logger.ts`) - ログ
- **Result パターン** (`src/core/types.ts`) - エラー処理
- **AgentError** (`src/core/errors.ts`) - エラータイプ
- **ProcessExecutor** (`src/core/process-executor.ts`) - 外部プロセス実行

---

## ✅ チェックリスト

ClaudeApiを使う前に:
- [ ] @anthropic-ai/sdk パッケージがインストールされていますか?
- [ ] API keyまたはOAuthトークンが設定されていますか?
- [ ] AuthProviderを正しく生成しましたか?
- [ ] タイムアウトが作業に十分長いですか?
- [ ] maxTokensが予想される答えの長さに十分ですか?
- [ ] Resultパターンでエラー処理をしましたか?
- [ ] ストリーミング使用時にすべてのイベントタイプを処理しましたか?

---

**最終更新:** 2026-03-04
**作成者:** documenterエージェント
**Architectスコア:** 99/100
**Reviewerスコア:** 97/100
**参照コード:** src/layer1/claude-api.ts (520行)
