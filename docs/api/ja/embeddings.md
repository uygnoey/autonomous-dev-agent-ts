> **Languages:** [한국어](../ko/embeddings.md) | [English](../en/embeddings.md) | [日本語](../ja/embeddings.md) | [Español](../es/embeddings.md)

# Embeddings — 埋め込みプロバイダ

## 🎯 これは何ですか?

**小学生向けの例え:**
単語を数字の配列に変える翻訳機です!

例えば:
- "hello world" → `[0.23, -0.45, 0.67, ...]` (384個の数字)
- "こんにちは" → `[0.19, -0.38, 0.71, ...]` (384個の数字)

なぜこうするの? コンピュータは単語の意味を理解できませんが、数字は計算できますから!

似た意味を持つ単語は似た数字配列になります:
- "dog" → `[0.1, 0.2, ...]`
- "puppy" → `[0.12, 0.19, ...]` (dogと似ている!)
- "car" → `[0.8, -0.5, ...]` (dogと全然違う!)

**技術説明:**
Huggingface Transformersライブラリを使用したML based テキスト埋め込みシステムです。
- モデル: `all-MiniLM-L6-v2` (軽量、高速、正確)
- 次元: 384次元 Float32ベクトル
- 正規化: L2 normalization (ベクトル長 = 1.0)
- バッチ処理サポート

---

## 🔍 なぜ必要ですか?

### 1. RAG (Retrieval Augmented Generation)
コード検索時に「意味的に」似ているコードを見つける必要があります:

```
ユーザー質問: "ユーザー認証するコードはどこ?"
→ 埋め込み: [0.23, -0.45, ...]

コードベース検索:
- auth.ts "user authentication" → [0.24, -0.44, ...] ✅ 近い!
- config.ts "configuration setup" → [0.89, -0.12, ...] ❌ 遠い
```

単純なキーワード検索よりずっと賢いです!

### 2. ベクトルDB (LanceDB) 統合
LanceDBはベクトル検索に最適化されたデータベースです:
- テキストを埋め込みに変換 → LanceDB保存
- ユーザー質問を埋め込みに変換 → 類似度検索
- 最も関連性の高い結果を返す

### 3. コンテキスト復元
以前の会話や決定事項を「意味ベース」で見つけることができます:
```
現在の状況: "Redux状態管理エラー"
→ 過去の類似状況を自動検索: "Zustand状態エラー解決方法"
```

---

## 📦 使い方

### ステップ 1: プロバイダ生成

```typescript
import { createTransformersEmbeddingProvider } from '../rag/embeddings.js';
import { Logger } from '../core/logger.js';

// ロガー生成
const logger = new Logger({ level: 'info' });

// 埋め込みプロバイダ生成 (デフォルト設定)
const embeddingProvider = createTransformersEmbeddingProvider(logger);

// またはカスタム設定
const customProvider = createTransformersEmbeddingProvider(
  logger,
  'my-embeddings',              // 名前
  'Xenova/all-MiniLM-L6-v2',    // モデル (デフォルト値)
  384,                           // 次元数 (デフォルト値)
);
```

### ステップ 2: 初期化

```typescript
// モデルロード (初回呼び出し時にモデルダウンロード発生可能)
const initResult = await embeddingProvider.initialize();

if (!initResult.ok) {
  console.error('初期化失敗:', initResult.error.message);
  return;
}

console.log('✅ 埋め込みモデルロード完了!');
```

### ステップ 3: 単一テキスト埋め込み

```typescript
// クエリをベクトルに変換
const queryResult = await embeddingProvider.embedQuery('ユーザー認証コード');

if (queryResult.ok) {
  const vector = queryResult.value;

  console.log('ベクトル次元:', vector.length);      // 384
  console.log('ベクトルタイプ:', vector.constructor);  // Float32Array
  console.log('最初の5個の値:', vector.slice(0, 5)); // [0.23, -0.45, ...]
}
```

### ステップ 4: バッチ埋め込み (複数テキスト一度に)

```typescript
// 複数のコードスニペットを一度に埋め込み
const texts = [
  'export function authenticate(user: User) { ... }',
  'class UserRepository { ... }',
  'interface AuthConfig { ... }',
];

const batchResult = await embeddingProvider.embed(texts);

if (batchResult.ok) {
  const vectors = batchResult.value;

  console.log('ベクトル個数:', vectors.length);     // 3
  console.log('各ベクトル次元:', vectors[0].length); // 384

  // 各ベクトルは正規化されている (長さ ≈ 1.0)
  vectors.forEach((vec, idx) => {
    console.log(`テキスト ${idx + 1} ベクトル:`, vec.slice(0, 3));
  });
}
```

### ステップ 5: LanceDBと統合

```typescript
import { VectorStore } from '../rag/vector-store.js';

// VectorStore生成 (埋め込みプロバイダ注入)
const vectorStore = new VectorStore(
  logger,
  embeddingProvider,
  '/path/to/db',
);

await vectorStore.initialize();

// ドキュメント追加 (自動的に埋め込み生成)
await vectorStore.addDocument({
  id: 'auth-001',
  content: 'export function authenticate(user: User) { ... }',
  metadata: { file: 'auth.ts', line: 42 },
});

// 類似度検索 (クエリも自動的に埋め込み)
const searchResult = await vectorStore.search('ユーザー認証', 5);
if (searchResult.ok) {
  console.log('検索結果:', searchResult.value);
}
```

---

## ⚠️ 注意点

### 1. 初回実行時のモデルダウンロード
**初回実行時にモデルファイルがダウンロードされます (約80MB):**

```typescript
// 初回実行 — モデルダウンロード (10~30秒かかる)
await embeddingProvider.initialize(); // ⏳ ダウンロード中...

// 以降の実行 — キャッシュ使用 (速い)
await embeddingProvider.initialize(); // ⚡ すぐ完了
```

**解決:**
- ネットワーク接続確認
- 十分なディスク容量確保 (~100MB)
- 初回実行時はタイムアウトを長く設定

### 2. 自動初期化
`initialize()`を呼び出さなくても最初の`embed()`/`embedQuery()`呼び出し時に自動初期化されます:

```typescript
const provider = createTransformersEmbeddingProvider(logger);

// initialize() 省略可能
const result = await provider.embedQuery('hello'); // 自動初期化
```

ただし**明示的な初期化を推奨**します (エラー処理が明確)。

### 3. バッチサイズ
テキストを一度にたくさん埋め込むとメモリ不足:

```typescript
// ❌ 危険: 10,000個のテキストを一度に
const result = await provider.embed(manyTexts); // メモリ不足!

// ✅ 安全: チャンクに分けて処理
const BATCH_SIZE = 100;
for (let i = 0; i < manyTexts.length; i += BATCH_SIZE) {
  const batch = manyTexts.slice(i, i + BATCH_SIZE);
  const result = await provider.embed(batch);
  // 結果処理...
}
```

### 4. 空文字列注意
空文字列も埋め込まれますが、意味のないベクトルになります:

```typescript
// ⚠️ 意味のない埋め込み
const result = await provider.embedQuery('');

// ✅ 入力検証
if (query.trim().length === 0) {
  console.error('空のクエリは埋め込めません。');
  return;
}
const result = await provider.embedQuery(query);
```

---

## 💡 例コード

### 例 1: コード類似度計算

```typescript
/**
 * 2つのコードスニペットの類似度を計算 (コサイン類似度)
 */
async function calculateSimilarity(
  provider: TransformersEmbeddingProvider,
  text1: string,
  text2: string,
): Promise<number> {
  // 2つのテキストをバッチ埋め込み
  const result = await provider.embed([text1, text2]);

  if (!result.ok) {
    console.error('埋め込み失敗:', result.error.message);
    return 0;
  }

  const [vec1, vec2] = result.value;
  if (!vec1 || !vec2) {
    return 0;
  }

  // コサイン類似度計算 (正規化ベクトルなので内積だけでOK)
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += (vec1[i] ?? 0) * (vec2[i] ?? 0);
  }

  return dotProduct; // -1.0 ~ 1.0 (1.0に近いほど類似)
}

// 使用例:
const code1 = 'function login(user: User) { ... }';
const code2 = 'function authenticate(user: User) { ... }';
const code3 = 'function calculateTax(amount: number) { ... }';

const similarity12 = await calculateSimilarity(provider, code1, code2);
const similarity13 = await calculateSimilarity(provider, code1, code3);

console.log('login vs authenticate:', similarity12); // 0.85 (類似!)
console.log('login vs calculateTax:', similarity13); // 0.12 (違う!)
```

### 例 2: コードベースインデックス化

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * プロジェクトの全TypeScriptファイルを埋め込んでインデックス化
 */
async function indexCodebase(
  provider: TransformersEmbeddingProvider,
  projectPath: string,
): Promise<Array<{ file: string; vector: Float32Array; content: string }>> {
  const index: Array<{ file: string; vector: Float32Array; content: string }> = [];

  // src/ ディレクトリの全.tsファイルを探す
  const files = await findTsFiles(path.join(projectPath, 'src'));

  // バッチで処理 (100個ずつ)
  const BATCH_SIZE = 100;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    // ファイル内容を読む
    const contents = await Promise.all(
      batch.map((file) => fs.readFile(file, 'utf-8')),
    );

    // バッチ埋め込み
    const result = await provider.embed(contents);
    if (!result.ok) {
      console.error('埋め込み失敗:', result.error.message);
      continue;
    }

    // インデックスに追加
    result.value.forEach((vector, idx) => {
      const file = batch[idx];
      const content = contents[idx];
      if (file && content) {
        index.push({ file, vector, content });
      }
    });

    console.log(`進行: ${i + batch.length}/${files.length} ファイル処理済み`);
  }

  return index;
}

// ヘルパー: .tsファイルを探す
async function findTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTsFiles(fullPath)));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}
```

### 例 3: セマンティック検索

```typescript
/**
 * インデックス化されたコードからクエリと最も類似したファイルを探す
 */
async function searchCode(
  provider: TransformersEmbeddingProvider,
  index: Array<{ file: string; vector: Float32Array; content: string }>,
  query: string,
  topK = 5,
): Promise<Array<{ file: string; similarity: number; content: string }>> {
  // クエリを埋め込み
  const queryResult = await provider.embedQuery(query);
  if (!queryResult.ok) {
    console.error('クエリ埋め込み失敗:', queryResult.error.message);
    return [];
  }

  const queryVector = queryResult.value;

  // 全インデックスと類似度計算
  const results = index.map(({ file, vector, content }) => {
    let similarity = 0;
    for (let i = 0; i < queryVector.length; i++) {
      similarity += (queryVector[i] ?? 0) * (vector[i] ?? 0);
    }
    return { file, similarity, content };
  });

  // 類似度の高い順にソートして上位K個を返す
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// 使用例:
const index = await indexCodebase(provider, '/path/to/project');
const results = await searchCode(
  provider,
  index,
  'ユーザー認証するコード',
  5,
);

console.log('検索結果:');
results.forEach(({ file, similarity, content }) => {
  console.log(`- ${file} (類似度: ${similarity.toFixed(3)})`);
  console.log(`  内容: ${content.slice(0, 100)}...`);
});
```

---

## 🐛 エラー対処

### エラーコード種類

#### 1. `rag_embedding_error` (モデルロード失敗)
**原因:**
- ネットワーク接続なし
- ディスク容量不足
- 間違ったモデル名

**解決:**
```typescript
const result = await provider.initialize();
if (!result.ok) {
  if (result.error.code === 'rag_embedding_error') {
    console.error('モデルロード失敗。チェックリスト:');
    console.error('1. インターネット接続確認');
    console.error('2. ディスク容量確認 (最低100MB必要)');
    console.error('3. モデル名確認:', modelName);
  }
}
```

#### 2. `rag_embedding_error` (埋め込み失敗)
**原因:**
- 入力テキストが長すぎる (トークン制限超過)
- メモリ不足

**解決:**
```typescript
// テキストが長すぎる場合は切る
const MAX_LENGTH = 512; // トークン数 (大体単語数)

function truncateText(text: string, maxLength: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxLength) {
    return text;
  }
  return words.slice(0, maxLength).join(' ') + '...';
}

const truncated = truncateText(longText, MAX_LENGTH);
const result = await provider.embedQuery(truncated);
```

### エラー処理パターン

```typescript
async function safeEmbed(
  provider: TransformersEmbeddingProvider,
  texts: string[],
): Promise<Float32Array[]> {
  // 空文字列フィルタリング
  const filtered = texts.filter((t) => t.trim().length > 0);

  if (filtered.length === 0) {
    console.warn('埋め込むテキストがありません。');
    return [];
  }

  // 長すぎるテキストを切る
  const truncated = filtered.map((t) => truncateText(t, 512));

  // 埋め込み
  const result = await provider.embed(truncated);

  if (!result.ok) {
    console.error('埋め込み失敗:', result.error.message);

    // 再試行戦略: バッチサイズを半分にして再試行
    if (truncated.length > 1) {
      console.log('バッチを分けて再試行中...');
      const mid = Math.floor(truncated.length / 2);
      const batch1 = await safeEmbed(provider, truncated.slice(0, mid));
      const batch2 = await safeEmbed(provider, truncated.slice(mid));
      return [...batch1, ...batch2];
    }

    return [];
  }

  return result.value;
}
```

---

## 📊 APIリファレンス

### `TransformersEmbeddingProvider` クラス

#### コンストラクタ
```typescript
constructor(
  name: string,
  modelName: string,
  dimensions: number,
  logger: Logger,
)
```

**パラメータ:**
- `name`: プロバイダ名
- `modelName`: Huggingfaceモデル名 (例: 'Xenova/all-MiniLM-L6-v2')
- `dimensions`: ベクトル次元数 (384)
- `logger`: Loggerインスタンス

---

#### `initialize()` メソッド
```typescript
async initialize(): Promise<Result<void>>
```

**説明:** モデルをメモリにロードします。初回呼び出し時にモデルダウンロード発生可能。

**戻り値:** 成功時は`ok(undefined)`、失敗時は`err(RagError)`

---

#### `embed()` メソッド
```typescript
async embed(texts: string[]): Promise<Result<Float32Array[]>>
```

**説明:** 複数のテキストをバッチで埋め込みます。

**パラメータ:**
- `texts`: 埋め込むテキスト配列

**戻り値:**
- 成功時: `ok([vec1, vec2, ...])` (各ベクトルは正規化されたFloat32Array)
- 失敗時: `err(RagError)`

---

#### `embedQuery()` メソッド
```typescript
async embedQuery(query: string): Promise<Result<Float32Array>>
```

**説明:** 単一クエリを埋め込みます。(`embed([query])`の便利メソッド)

**パラメータ:**
- `query`: 埋め込むクエリ文字列

**戻り値:**
- 成功時: `ok(vector)` (正規化されたFloat32Array)
- 失敗時: `err(RagError)`

---

### `createTransformersEmbeddingProvider()` 関数

```typescript
function createTransformersEmbeddingProvider(
  logger: Logger,
  name?: string,
  modelName?: string,
  dimensions?: number,
): TransformersEmbeddingProvider
```

**デフォルト値:**
- `name`: 'transformers'
- `modelName`: 'Xenova/all-MiniLM-L6-v2'
- `dimensions`: 384

---

### `normalizeVector()` 関数

```typescript
function normalizeVector(vector: Float32Array): Float32Array
```

**説明:** ベクトルをL2正規化します (長さ = 1.0)。

**パラメータ:**
- `vector`: 正規化するベクトル

**戻り値:** 正規化されたベクトル (元のものは変更しない)

---

## 🎓 高度な使用法

### 1. カスタムモデル使用

他のHuggingfaceモデルを使用できます:

```typescript
// 多言語モデル (日本語サポート向上)
const multilingual = new TransformersEmbeddingProvider(
  'multilingual',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  384,
  logger,
);

// より大きいモデル (精度向上、速度低下)
const large = new TransformersEmbeddingProvider(
  'large',
  'Xenova/all-mpnet-base-v2',
  768, // 次元増加
  logger,
);
```

### 2. ベクトル保存最適化

Float32Arrayはメモリ効率的ですが、さらに圧縮するなら:

```typescript
// Float32 → Float16変換 (50%メモリ節約)
function compressVector(vec: Float32Array): Uint8Array {
  const compressed = new Uint8Array(vec.length * 2);
  for (let i = 0; i < vec.length; i++) {
    const f16 = floatToHalf(vec[i] ?? 0);
    compressed[i * 2] = f16 & 0xff;
    compressed[i * 2 + 1] = (f16 >> 8) & 0xff;
  }
  return compressed;
}

// Float16 → Float32復元
function decompressVector(compressed: Uint8Array): Float32Array {
  const vec = new Float32Array(compressed.length / 2);
  for (let i = 0; i < vec.length; i++) {
    const f16 = compressed[i * 2]! | (compressed[i * 2 + 1]! << 8);
    vec[i] = halfToFloat(f16);
  }
  return vec;
}

// Float32 → Float16変換 (簡単実装)
function floatToHalf(val: number): number {
  // IEEE 754 half-precision変換ロジック
  // (省略 - ライブラリ使用推奨)
  return 0;
}

function halfToFloat(val: number): number {
  // Float16 → Float32変換ロジック
  return 0;
}
```

### 3. キャッシング戦略

よく使う埋め込みはキャッシュ:

```typescript
class CachedEmbeddingProvider {
  private cache = new Map<string, Float32Array>();

  constructor(private provider: TransformersEmbeddingProvider) {}

  async embedQuery(query: string): Promise<Result<Float32Array>> {
    // キャッシュ確認
    const cached = this.cache.get(query);
    if (cached) {
      return ok(cached);
    }

    // キャッシュミス — 実際の埋め込み
    const result = await this.provider.embedQuery(query);
    if (result.ok) {
      this.cache.set(query, result.value);
    }

    return result;
  }

  clearCache() {
    this.cache.clear();
  }
}
```

---

## 🔗 関連モジュール

- **VectorStore** (`src/rag/vector-store.ts`) - LanceDBベクトルストア
- **CodeIndexer** (`src/rag/code-indexer.ts`) - コードベースインデックス化
- **Logger** (`src/core/logger.ts`) - ログ
- **Result パターン** (`src/core/types.ts`) - エラー処理

---

## ✅ チェックリスト

Embeddingsを使う前に:
- [ ] Loggerを生成しましたか?
- [ ] 初回実行時にネットワーク接続がありますか?
- [ ] ディスク容量は十分ですか? (最低100MB)
- [ ] Resultパターンでエラー処理をしましたか?
- [ ] 入力テキストが長すぎませんか? (512トークン以下推奨)

---

**最終更新:** 2026-03-04
**作成者:** documenterエージェント
**モデル:** all-MiniLM-L6-v2 (384次元)
