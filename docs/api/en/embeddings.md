> **Languages:** [한국어](../ko/embeddings.md) | [English](../en/embeddings.md) | [日本語](../ja/embeddings.md) | [Español](../es/embeddings.md)

# Embeddings — Embedding Provider

## 🎯 What is this?

**Elementary School Analogy:**
It's a translator that converts words into number arrays!

For example:
- "hello world" → `[0.23, -0.45, 0.67, ...]` (384 numbers)
- "안녕하세요" → `[0.19, -0.38, 0.71, ...]` (384 numbers)

Why do this? Computers can't understand word meanings, but they can calculate with numbers!

Words with similar meanings get similar number arrays:
- "dog" → `[0.1, 0.2, ...]`
- "puppy" → `[0.12, 0.19, ...]` (similar to dog!)
- "car" → `[0.8, -0.5, ...]` (completely different from dog!)

**Technical Description:**
ML-based text embedding system using Huggingface Transformers library.
- Model: `all-MiniLM-L6-v2` (lightweight, fast, accurate)
- Dimensions: 384-dimensional Float32 vectors
- Normalization: L2 normalization (vector length = 1.0)
- Batch processing support

---

## 🔍 Why is it needed?

### 1. RAG (Retrieval Augmented Generation)
Need to find "semantically" similar code when searching:

```
User question: "Where is the user authentication code?"
→ Embedding: [0.23, -0.45, ...]

Codebase search:
- auth.ts "user authentication" → [0.24, -0.44, ...] ✅ Close!
- config.ts "configuration setup" → [0.89, -0.12, ...] ❌ Far
```

Much smarter than simple keyword search!

### 2. Vector DB (LanceDB) Integration
LanceDB is a database optimized for vector search:
- Convert text to embeddings → Store in LanceDB
- Convert user question to embeddings → Similarity search
- Return most relevant results

### 3. Context Recovery
Can find previous conversations or decisions based on "meaning":
```
Current situation: "Redux state management error"
→ Auto-search similar past situations: "Zustand state error resolution"
```

---

## 📦 How to use?

### Step 1: Create Provider

```typescript
import { createTransformersEmbeddingProvider } from '../rag/embeddings.js';
import { Logger } from '../core/logger.js';

// Create logger
const logger = new Logger({ level: 'info' });

// Create embedding provider (default settings)
const embeddingProvider = createTransformersEmbeddingProvider(logger);

// Or custom settings
const customProvider = createTransformersEmbeddingProvider(
  logger,
  'my-embeddings',              // Name
  'Xenova/all-MiniLM-L6-v2',    // Model (default)
  384,                           // Dimensions (default)
);
```

### Step 2: Initialize

```typescript
// Load model (model download may occur on first call)
const initResult = await embeddingProvider.initialize();

if (!initResult.ok) {
  console.error('Initialization failed:', initResult.error.message);
  return;
}

console.log('✅ Embedding model loaded!');
```

### Step 3: Single Text Embedding

```typescript
// Convert query to vector
const queryResult = await embeddingProvider.embedQuery('user authentication code');

if (queryResult.ok) {
  const vector = queryResult.value;

  console.log('Vector dimensions:', vector.length);      // 384
  console.log('Vector type:', vector.constructor);  // Float32Array
  console.log('First 5 values:', vector.slice(0, 5)); // [0.23, -0.45, ...]
}
```

### Step 4: Batch Embedding (Multiple Texts at Once)

```typescript
// Embed multiple code snippets at once
const texts = [
  'export function authenticate(user: User) { ... }',
  'class UserRepository { ... }',
  'interface AuthConfig { ... }',
];

const batchResult = await embeddingProvider.embed(texts);

if (batchResult.ok) {
  const vectors = batchResult.value;

  console.log('Number of vectors:', vectors.length);     // 3
  console.log('Each vector dimensions:', vectors[0].length); // 384

  // Each vector is normalized (length ≈ 1.0)
  vectors.forEach((vec, idx) => {
    console.log(`Text ${idx + 1} vector:`, vec.slice(0, 3));
  });
}
```

### Step 5: LanceDB Integration

```typescript
import { VectorStore } from '../rag/vector-store.js';

// Create VectorStore (inject embedding provider)
const vectorStore = new VectorStore(
  logger,
  embeddingProvider,
  '/path/to/db',
);

await vectorStore.initialize();

// Add document (automatically generates embedding)
await vectorStore.addDocument({
  id: 'auth-001',
  content: 'export function authenticate(user: User) { ... }',
  metadata: { file: 'auth.ts', line: 42 },
});

// Similarity search (query also automatically embedded)
const searchResult = await vectorStore.search('user authentication', 5);
if (searchResult.ok) {
  console.log('Search results:', searchResult.value);
}
```

---

## ⚠️ Cautions

### 1. Model Download on First Run
**Model files are downloaded on first execution (about 80MB):**

```typescript
// First run — Model download (takes 10~30 seconds)
await embeddingProvider.initialize(); // ⏳ Downloading...

// Subsequent runs — Use cache (fast)
await embeddingProvider.initialize(); // ⚡ Immediate completion
```

**Solution:**
- Check network connection
- Ensure sufficient disk space (~100MB)
- Set longer timeout on first run

### 2. Auto-initialization
Even without calling `initialize()`, auto-initializes on first `embed()`/`embedQuery()` call:

```typescript
const provider = createTransformersEmbeddingProvider(logger);

// Can skip initialize()
const result = await provider.embedQuery('hello'); // Auto-initialization
```

However, **explicit initialization is recommended** (clearer error handling).

### 3. Batch Size
Memory shortage if embedding too many texts at once:

```typescript
// ❌ Dangerous: 10,000 texts at once
const result = await provider.embed(manyTexts); // Out of memory!

// ✅ Safe: Process in chunks
const BATCH_SIZE = 100;
for (let i = 0; i < manyTexts.length; i += BATCH_SIZE) {
  const batch = manyTexts.slice(i, i + BATCH_SIZE);
  const result = await provider.embed(batch);
  // Process results...
}
```

### 4. Empty String Caution
Empty strings are embedded but produce meaningless vectors:

```typescript
// ⚠️ Meaningless embedding
const result = await provider.embedQuery('');

// ✅ Input validation
if (query.trim().length === 0) {
  console.error('Cannot embed empty query.');
  return;
}
const result = await provider.embedQuery(query);
```

---

## 💡 Example Code

### Example 1: Calculate Code Similarity

```typescript
/**
 * Calculate similarity between two code snippets (cosine similarity)
 */
async function calculateSimilarity(
  provider: TransformersEmbeddingProvider,
  text1: string,
  text2: string,
): Promise<number> {
  // Batch embed both texts
  const result = await provider.embed([text1, text2]);

  if (!result.ok) {
    console.error('Embedding failed:', result.error.message);
    return 0;
  }

  const [vec1, vec2] = result.value;
  if (!vec1 || !vec2) {
    return 0;
  }

  // Calculate cosine similarity (just dot product for normalized vectors)
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += (vec1[i] ?? 0) * (vec2[i] ?? 0);
  }

  return dotProduct; // -1.0 ~ 1.0 (closer to 1.0 = more similar)
}

// Usage example:
const code1 = 'function login(user: User) { ... }';
const code2 = 'function authenticate(user: User) { ... }';
const code3 = 'function calculateTax(amount: number) { ... }';

const similarity12 = await calculateSimilarity(provider, code1, code2);
const similarity13 = await calculateSimilarity(provider, code1, code3);

console.log('login vs authenticate:', similarity12); // 0.85 (similar!)
console.log('login vs calculateTax:', similarity13); // 0.12 (different!)
```

### Example 2: Codebase Indexing

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Index all TypeScript files in project by embedding
 */
async function indexCodebase(
  provider: TransformersEmbeddingProvider,
  projectPath: string,
): Promise<Array<{ file: string; vector: Float32Array; content: string }>> {
  const index: Array<{ file: string; vector: Float32Array; content: string }> = [];

  // Find all .ts files in src/ directory
  const files = await findTsFiles(path.join(projectPath, 'src'));

  // Process in batches (100 at a time)
  const BATCH_SIZE = 100;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    // Read file contents
    const contents = await Promise.all(
      batch.map((file) => fs.readFile(file, 'utf-8')),
    );

    // Batch embedding
    const result = await provider.embed(contents);
    if (!result.ok) {
      console.error('Embedding failed:', result.error.message);
      continue;
    }

    // Add to index
    result.value.forEach((vector, idx) => {
      const file = batch[idx];
      const content = contents[idx];
      if (file && content) {
        index.push({ file, vector, content });
      }
    });

    console.log(`Progress: ${i + batch.length}/${files.length} files processed`);
  }

  return index;
}

// Helper: Find .ts files
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

### Example 3: Semantic Search

```typescript
/**
 * Find files most similar to query in indexed code
 */
async function searchCode(
  provider: TransformersEmbeddingProvider,
  index: Array<{ file: string; vector: Float32Array; content: string }>,
  query: string,
  topK = 5,
): Promise<Array<{ file: string; similarity: number; content: string }>> {
  // Embed query
  const queryResult = await provider.embedQuery(query);
  if (!queryResult.ok) {
    console.error('Query embedding failed:', queryResult.error.message);
    return [];
  }

  const queryVector = queryResult.value;

  // Calculate similarity with all indices
  const results = index.map(({ file, vector, content }) => {
    let similarity = 0;
    for (let i = 0; i < queryVector.length; i++) {
      similarity += (queryVector[i] ?? 0) * (vector[i] ?? 0);
    }
    return { file, similarity, content };
  });

  // Sort by similarity descending and return top K
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// Usage example:
const index = await indexCodebase(provider, '/path/to/project');
const results = await searchCode(
  provider,
  index,
  'user authentication code',
  5,
);

console.log('Search results:');
results.forEach(({ file, similarity, content }) => {
  console.log(`- ${file} (similarity: ${similarity.toFixed(3)})`);
  console.log(`  Content: ${content.slice(0, 100)}...`);
});
```

---

## 🐛 What to do when errors occur?

### Error Code Types

#### 1. `rag_embedding_error` (Model Loading Failed)
**Cause:**
- No network connection
- Insufficient disk space
- Wrong model name

**Solution:**
```typescript
const result = await provider.initialize();
if (!result.ok) {
  if (result.error.code === 'rag_embedding_error') {
    console.error('Model loading failed. Checklist:');
    console.error('1. Check internet connection');
    console.error('2. Check disk space (minimum 100MB needed)');
    console.error('3. Check model name:', modelName);
  }
}
```

#### 2. `rag_embedding_error` (Embedding Failed)
**Cause:**
- Input text too long (exceeds token limit)
- Out of memory

**Solution:**
```typescript
// Truncate if text is too long
const MAX_LENGTH = 512; // Token count (roughly word count)

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

### Error Handling Pattern

```typescript
async function safeEmbed(
  provider: TransformersEmbeddingProvider,
  texts: string[],
): Promise<Float32Array[]> {
  // Filter empty strings
  const filtered = texts.filter((t) => t.trim().length > 0);

  if (filtered.length === 0) {
    console.warn('No texts to embed.');
    return [];
  }

  // Truncate too long texts
  const truncated = filtered.map((t) => truncateText(t, 512));

  // Embed
  const result = await provider.embed(truncated);

  if (!result.ok) {
    console.error('Embedding failed:', result.error.message);

    // Retry strategy: Split batch in half and retry
    if (truncated.length > 1) {
      console.log('Retrying with split batches...');
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

## 📊 API Reference

### `TransformersEmbeddingProvider` Class

#### Constructor
```typescript
constructor(
  name: string,
  modelName: string,
  dimensions: number,
  logger: Logger,
)
```

**Parameters:**
- `name`: Provider name
- `modelName`: Huggingface model name (e.g., 'Xenova/all-MiniLM-L6-v2')
- `dimensions`: Vector dimensions (384)
- `logger`: Logger instance

---

#### `initialize()` Method
```typescript
async initialize(): Promise<Result<void>>
```

**Description:** Load model into memory. Model download may occur on first call.

**Return Value:** `ok(undefined)` on success, `err(RagError)` on failure

---

#### `embed()` Method
```typescript
async embed(texts: string[]): Promise<Result<Float32Array[]>>
```

**Description:** Batch embed multiple texts.

**Parameters:**
- `texts`: Array of texts to embed

**Return Value:**
- Success: `ok([vec1, vec2, ...])` (each vector is normalized Float32Array)
- Failure: `err(RagError)`

---

#### `embedQuery()` Method
```typescript
async embedQuery(query: string): Promise<Result<Float32Array>>
```

**Description:** Embed single query. (Convenience method for `embed([query])`)

**Parameters:**
- `query`: Query string to embed

**Return Value:**
- Success: `ok(vector)` (normalized Float32Array)
- Failure: `err(RagError)`

---

### `createTransformersEmbeddingProvider()` Function

```typescript
function createTransformersEmbeddingProvider(
  logger: Logger,
  name?: string,
  modelName?: string,
  dimensions?: number,
): TransformersEmbeddingProvider
```

**Defaults:**
- `name`: 'transformers'
- `modelName`: 'Xenova/all-MiniLM-L6-v2'
- `dimensions`: 384

---

### `normalizeVector()` Function

```typescript
function normalizeVector(vector: Float32Array): Float32Array
```

**Description:** L2 normalize vector (length = 1.0).

**Parameters:**
- `vector`: Vector to normalize

**Return Value:** Normalized vector (does not modify original)

---

## 🎓 Advanced Usage

### 1. Use Custom Model

Can use other Huggingface models:

```typescript
// Multilingual model (improved Korean support)
const multilingual = new TransformersEmbeddingProvider(
  'multilingual',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  384,
  logger,
);

// Larger model (better accuracy, slower speed)
const large = new TransformersEmbeddingProvider(
  'large',
  'Xenova/all-mpnet-base-v2',
  768, // Increased dimensions
  logger,
);
```

### 2. Vector Storage Optimization

Float32Array is memory efficient, but for more compression:

```typescript
// Float32 → Float16 conversion (50% memory savings)
function compressVector(vec: Float32Array): Uint8Array {
  const compressed = new Uint8Array(vec.length * 2);
  for (let i = 0; i < vec.length; i++) {
    const f16 = floatToHalf(vec[i] ?? 0);
    compressed[i * 2] = f16 & 0xff;
    compressed[i * 2 + 1] = (f16 >> 8) & 0xff;
  }
  return compressed;
}

// Float16 → Float32 restoration
function decompressVector(compressed: Uint8Array): Float32Array {
  const vec = new Float32Array(compressed.length / 2);
  for (let i = 0; i < vec.length; i++) {
    const f16 = compressed[i * 2]! | (compressed[i * 2 + 1]! << 8);
    vec[i] = halfToFloat(f16);
  }
  return vec;
}

// Float32 → Float16 conversion (simple implementation)
function floatToHalf(val: number): number {
  // IEEE 754 half-precision conversion logic
  // (omitted - recommend using library)
  return 0;
}

function halfToFloat(val: number): number {
  // Float16 → Float32 conversion logic
  return 0;
}
```

### 3. Caching Strategy

Cache frequently used embeddings:

```typescript
class CachedEmbeddingProvider {
  private cache = new Map<string, Float32Array>();

  constructor(private provider: TransformersEmbeddingProvider) {}

  async embedQuery(query: string): Promise<Result<Float32Array>> {
    // Check cache
    const cached = this.cache.get(query);
    if (cached) {
      return ok(cached);
    }

    // Cache miss — actual embedding
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

## 🔗 Related Modules

- **VectorStore** (`src/rag/vector-store.ts`) - LanceDB vector store
- **CodeIndexer** (`src/rag/code-indexer.ts`) - Codebase indexing
- **Logger** (`src/core/logger.ts`) - Logging
- **Result Pattern** (`src/core/types.ts`) - Error handling

---

## ✅ Checklist

Before using Embeddings:
- [ ] Created Logger?
- [ ] Network connection available on first run?
- [ ] Sufficient disk space? (minimum 100MB)
- [ ] Handled errors with Result pattern?
- [ ] Input text not too long? (recommended under 512 tokens)

---

**Last Updated:** 2026-03-04
**Author:** documenter agent
**Model:** all-MiniLM-L6-v2 (384 dimensions)
