> **Languages:** [한국어](../ko/embeddings.md) | [English](../en/embeddings.md) | [日本語](../ja/embeddings.md) | [Español](../es/embeddings.md)

# Embeddings — 임베딩 프로바이더

## 🎯 이게 뭐야?

**초등학생 비유:**
단어를 숫자 배열로 바꿔주는 번역기예요!

예를 들어:
- "hello world" → `[0.23, -0.45, 0.67, ...]` (384개 숫자)
- "안녕하세요" → `[0.19, -0.38, 0.71, ...]` (384개 숫자)

왜 이렇게 하냐고요? 컴퓨터는 단어의 의미를 이해하지 못하지만, 숫자는 계산할 수 있거든요!

비슷한 의미를 가진 단어들은 비슷한 숫자 배열이 나와요:
- "dog" → `[0.1, 0.2, ...]`
- "puppy" → `[0.12, 0.19, ...]` (dog와 비슷!)
- "car" → `[0.8, -0.5, ...]` (dog와 완전 다름!)

**기술 설명:**
Huggingface Transformers 라이브러리를 사용한 ML 기반 텍스트 임베딩 시스템입니다.
- 모델: `all-MiniLM-L6-v2` (경량, 빠름, 정확)
- 차원: 384차원 Float32 벡터
- 정규화: L2 normalization (벡터 길이 = 1.0)
- 배치 처리 지원

---

## 🔍 왜 필요해?

### 1. RAG (Retrieval Augmented Generation)
코드 검색 시 "의미적으로" 비슷한 코드를 찾아야 해요:

```
유저 질문: "사용자 인증하는 코드 어디있어?"
→ 임베딩: [0.23, -0.45, ...]

코드베이스 검색:
- auth.ts "user authentication" → [0.24, -0.44, ...] ✅ 가까움!
- config.ts "configuration setup" → [0.89, -0.12, ...] ❌ 멀음
```

단순 키워드 검색보다 훨씬 똑똑합니다!

### 2. 벡터 DB (LanceDB) 통합
LanceDB는 벡터 검색에 최적화된 데이터베이스입니다:
- 텍스트를 임베딩으로 변환 → LanceDB 저장
- 유저 질문을 임베딩으로 변환 → 유사도 검색
- 가장 관련 있는 결과 반환

### 3. 컨텍스트 복원
이전 대화나 결정 사항을 "의미 기반"으로 찾을 수 있어요:
```
현재 상황: "Redux 상태 관리 에러"
→ 과거 유사 상황 자동 검색: "Zustand 상태 에러 해결 방법"
```

---

## 📦 어떻게 쓰는지?

### 단계 1: 프로바이더 생성

```typescript
import { createTransformersEmbeddingProvider } from '../rag/embeddings.js';
import { Logger } from '../core/logger.js';

// 로거 생성
const logger = new Logger({ level: 'info' });

// 임베딩 프로바이더 생성 (기본 설정)
const embeddingProvider = createTransformersEmbeddingProvider(logger);

// 또는 커스텀 설정
const customProvider = createTransformersEmbeddingProvider(
  logger,
  'my-embeddings',              // 이름
  'Xenova/all-MiniLM-L6-v2',    // 모델 (기본값)
  384,                           // 차원 수 (기본값)
);
```

### 단계 2: 초기화

```typescript
// 모델 로딩 (첫 호출 시 모델 다운로드 발생 가능)
const initResult = await embeddingProvider.initialize();

if (!initResult.ok) {
  console.error('초기화 실패:', initResult.error.message);
  return;
}

console.log('✅ 임베딩 모델 로딩 완료!');
```

### 단계 3: 단일 텍스트 임베딩

```typescript
// 쿼리를 벡터로 변환
const queryResult = await embeddingProvider.embedQuery('사용자 인증 코드');

if (queryResult.ok) {
  const vector = queryResult.value;

  console.log('벡터 차원:', vector.length);      // 384
  console.log('벡터 타입:', vector.constructor);  // Float32Array
  console.log('첫 5개 값:', vector.slice(0, 5)); // [0.23, -0.45, ...]
}
```

### 단계 4: 배치 임베딩 (여러 텍스트 한 번에)

```typescript
// 여러 코드 스니펫을 한 번에 임베딩
const texts = [
  'export function authenticate(user: User) { ... }',
  'class UserRepository { ... }',
  'interface AuthConfig { ... }',
];

const batchResult = await embeddingProvider.embed(texts);

if (batchResult.ok) {
  const vectors = batchResult.value;

  console.log('벡터 개수:', vectors.length);     // 3
  console.log('각 벡터 차원:', vectors[0].length); // 384

  // 각 벡터는 정규화됨 (길이 ≈ 1.0)
  vectors.forEach((vec, idx) => {
    console.log(`텍스트 ${idx + 1} 벡터:`, vec.slice(0, 3));
  });
}
```

### 단계 5: LanceDB와 통합

```typescript
import { VectorStore } from '../rag/vector-store.js';

// VectorStore 생성 (임베딩 프로바이더 주입)
const vectorStore = new VectorStore(
  logger,
  embeddingProvider,
  '/path/to/db',
);

await vectorStore.initialize();

// 문서 추가 (자동으로 임베딩 생성)
await vectorStore.addDocument({
  id: 'auth-001',
  content: 'export function authenticate(user: User) { ... }',
  metadata: { file: 'auth.ts', line: 42 },
});

// 유사도 검색 (쿼리도 자동으로 임베딩)
const searchResult = await vectorStore.search('사용자 인증', 5);
if (searchResult.ok) {
  console.log('검색 결과:', searchResult.value);
}
```

---

## ⚠️ 조심할 점

### 1. 첫 실행 시 모델 다운로드
**첫 번째 실행 시 모델 파일이 다운로드됩니다 (약 80MB):**

```typescript
// 첫 실행 — 모델 다운로드 (10~30초 소요)
await embeddingProvider.initialize(); // ⏳ 다운로드 중...

// 이후 실행 — 캐시 사용 (빠름)
await embeddingProvider.initialize(); // ⚡ 즉시 완료
```

**해결:**
- 네트워크 연결 확인
- 충분한 디스크 공간 확보 (~100MB)
- 첫 실행 시 타임아웃 길게 설정

### 2. 자동 초기화
`initialize()`를 호출하지 않아도 첫 `embed()`/`embedQuery()` 호출 시 자동 초기화됩니다:

```typescript
const provider = createTransformersEmbeddingProvider(logger);

// initialize() 생략 가능
const result = await provider.embedQuery('hello'); // 자동 초기화
```

하지만 **명시적 초기화가 권장됩니다** (에러 처리 명확).

### 3. 배치 크기
너무 많은 텍스트를 한 번에 임베딩하면 메모리 부족:

```typescript
// ❌ 위험: 10,000개 텍스트 한 번에
const result = await provider.embed(manyTexts); // 메모리 부족!

// ✅ 안전: 청크로 나눠서 처리
const BATCH_SIZE = 100;
for (let i = 0; i < manyTexts.length; i += BATCH_SIZE) {
  const batch = manyTexts.slice(i, i + BATCH_SIZE);
  const result = await provider.embed(batch);
  // 결과 처리...
}
```

### 4. 빈 문자열 주의
빈 문자열도 임베딩되지만 의미 없는 벡터가 나옵니다:

```typescript
// ⚠️ 의미 없는 임베딩
const result = await provider.embedQuery('');

// ✅ 입력 검증
if (query.trim().length === 0) {
  console.error('빈 쿼리는 임베딩할 수 없습니다.');
  return;
}
const result = await provider.embedQuery(query);
```

---

## 💡 예제 코드

### 예제 1: 코드 유사도 계산

```typescript
/**
 * 두 코드 스니펫의 유사도를 계산 (코사인 유사도)
 */
async function calculateSimilarity(
  provider: TransformersEmbeddingProvider,
  text1: string,
  text2: string,
): Promise<number> {
  // 두 텍스트를 배치 임베딩
  const result = await provider.embed([text1, text2]);

  if (!result.ok) {
    console.error('임베딩 실패:', result.error.message);
    return 0;
  }

  const [vec1, vec2] = result.value;
  if (!vec1 || !vec2) {
    return 0;
  }

  // 코사인 유사도 계산 (정규화 벡터라서 내적만 하면 됨)
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += (vec1[i] ?? 0) * (vec2[i] ?? 0);
  }

  return dotProduct; // -1.0 ~ 1.0 (1.0에 가까울수록 유사)
}

// 사용 예:
const code1 = 'function login(user: User) { ... }';
const code2 = 'function authenticate(user: User) { ... }';
const code3 = 'function calculateTax(amount: number) { ... }';

const similarity12 = await calculateSimilarity(provider, code1, code2);
const similarity13 = await calculateSimilarity(provider, code1, code3);

console.log('login vs authenticate:', similarity12); // 0.85 (유사!)
console.log('login vs calculateTax:', similarity13); // 0.12 (다름!)
```

### 예제 2: 코드베이스 인덱싱

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * 프로젝트의 모든 TypeScript 파일을 임베딩하여 인덱싱
 */
async function indexCodebase(
  provider: TransformersEmbeddingProvider,
  projectPath: string,
): Promise<Array<{ file: string; vector: Float32Array; content: string }>> {
  const index: Array<{ file: string; vector: Float32Array; content: string }> = [];

  // src/ 디렉토리의 모든 .ts 파일 찾기
  const files = await findTsFiles(path.join(projectPath, 'src'));

  // 배치로 처리 (100개씩)
  const BATCH_SIZE = 100;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    // 파일 내용 읽기
    const contents = await Promise.all(
      batch.map((file) => fs.readFile(file, 'utf-8')),
    );

    // 배치 임베딩
    const result = await provider.embed(contents);
    if (!result.ok) {
      console.error('임베딩 실패:', result.error.message);
      continue;
    }

    // 인덱스에 추가
    result.value.forEach((vector, idx) => {
      const file = batch[idx];
      const content = contents[idx];
      if (file && content) {
        index.push({ file, vector, content });
      }
    });

    console.log(`진행: ${i + batch.length}/${files.length} 파일 처리됨`);
  }

  return index;
}

// 헬퍼: .ts 파일 찾기
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

### 예제 3: 시맨틱 검색

```typescript
/**
 * 인덱싱된 코드에서 쿼리와 가장 유사한 파일 찾기
 */
async function searchCode(
  provider: TransformersEmbeddingProvider,
  index: Array<{ file: string; vector: Float32Array; content: string }>,
  query: string,
  topK = 5,
): Promise<Array<{ file: string; similarity: number; content: string }>> {
  // 쿼리를 임베딩
  const queryResult = await provider.embedQuery(query);
  if (!queryResult.ok) {
    console.error('쿼리 임베딩 실패:', queryResult.error.message);
    return [];
  }

  const queryVector = queryResult.value;

  // 모든 인덱스와 유사도 계산
  const results = index.map(({ file, vector, content }) => {
    let similarity = 0;
    for (let i = 0; i < queryVector.length; i++) {
      similarity += (queryVector[i] ?? 0) * (vector[i] ?? 0);
    }
    return { file, similarity, content };
  });

  // 유사도 높은 순으로 정렬 후 상위 K개 반환
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// 사용 예:
const index = await indexCodebase(provider, '/path/to/project');
const results = await searchCode(
  provider,
  index,
  '사용자 인증하는 코드',
  5,
);

console.log('검색 결과:');
results.forEach(({ file, similarity, content }) => {
  console.log(`- ${file} (유사도: ${similarity.toFixed(3)})`);
  console.log(`  내용: ${content.slice(0, 100)}...`);
});
```

---

## 🐛 에러 나면 어떻게?

### 에러 코드 종류

#### 1. `rag_embedding_error` (모델 로딩 실패)
**원인:**
- 네트워크 연결 없음
- 디스크 공간 부족
- 잘못된 모델 이름

**해결:**
```typescript
const result = await provider.initialize();
if (!result.ok) {
  if (result.error.code === 'rag_embedding_error') {
    console.error('모델 로딩 실패. 체크리스트:');
    console.error('1. 인터넷 연결 확인');
    console.error('2. 디스크 공간 확인 (최소 100MB 필요)');
    console.error('3. 모델 이름 확인:', modelName);
  }
}
```

#### 2. `rag_embedding_error` (임베딩 실패)
**원인:**
- 입력 텍스트가 너무 길음 (토큰 제한 초과)
- 메모리 부족

**해결:**
```typescript
// 텍스트가 너무 길면 자르기
const MAX_LENGTH = 512; // 토큰 수 (대략 단어 수)

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

### 에러 처리 패턴

```typescript
async function safeEmbed(
  provider: TransformersEmbeddingProvider,
  texts: string[],
): Promise<Float32Array[]> {
  // 빈 문자열 필터링
  const filtered = texts.filter((t) => t.trim().length > 0);

  if (filtered.length === 0) {
    console.warn('임베딩할 텍스트가 없습니다.');
    return [];
  }

  // 너무 긴 텍스트 자르기
  const truncated = filtered.map((t) => truncateText(t, 512));

  // 임베딩
  const result = await provider.embed(truncated);

  if (!result.ok) {
    console.error('임베딩 실패:', result.error.message);

    // 재시도 전략: 배치 크기를 절반으로 줄여서 재시도
    if (truncated.length > 1) {
      console.log('배치를 나눠서 재시도 중...');
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

## 📊 API 레퍼런스

### `TransformersEmbeddingProvider` 클래스

#### 생성자
```typescript
constructor(
  name: string,
  modelName: string,
  dimensions: number,
  logger: Logger,
)
```

**매개변수:**
- `name`: 프로바이더 이름
- `modelName`: Huggingface 모델 이름 (예: 'Xenova/all-MiniLM-L6-v2')
- `dimensions`: 벡터 차원 수 (384)
- `logger`: Logger 인스턴스

---

#### `initialize()` 메서드
```typescript
async initialize(): Promise<Result<void>>
```

**설명:** 모델을 메모리에 로드합니다. 첫 호출 시 모델 다운로드 발생 가능.

**반환값:** 성공 시 `ok(undefined)`, 실패 시 `err(RagError)`

---

#### `embed()` 메서드
```typescript
async embed(texts: string[]): Promise<Result<Float32Array[]>>
```

**설명:** 여러 텍스트를 배치로 임베딩합니다.

**매개변수:**
- `texts`: 임베딩할 텍스트 배열

**반환값:**
- 성공 시: `ok([vec1, vec2, ...])` (각 벡터는 정규화된 Float32Array)
- 실패 시: `err(RagError)`

---

#### `embedQuery()` 메서드
```typescript
async embedQuery(query: string): Promise<Result<Float32Array>>
```

**설명:** 단일 쿼리를 임베딩합니다. (`embed([query])`의 편의 메서드)

**매개변수:**
- `query`: 임베딩할 쿼리 문자열

**반환값:**
- 성공 시: `ok(vector)` (정규화된 Float32Array)
- 실패 시: `err(RagError)`

---

### `createTransformersEmbeddingProvider()` 함수

```typescript
function createTransformersEmbeddingProvider(
  logger: Logger,
  name?: string,
  modelName?: string,
  dimensions?: number,
): TransformersEmbeddingProvider
```

**기본값:**
- `name`: 'transformers'
- `modelName`: 'Xenova/all-MiniLM-L6-v2'
- `dimensions`: 384

---

### `normalizeVector()` 함수

```typescript
function normalizeVector(vector: Float32Array): Float32Array
```

**설명:** 벡터를 L2 정규화합니다 (길이 = 1.0).

**매개변수:**
- `vector`: 정규화할 벡터

**반환값:** 정규화된 벡터 (원본 수정 안 함)

---

## 🎓 고급 사용법

### 1. 커스텀 모델 사용

다른 Huggingface 모델을 사용할 수 있습니다:

```typescript
// 다국어 모델 (한국어 지원 향상)
const multilingual = new TransformersEmbeddingProvider(
  'multilingual',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  384,
  logger,
);

// 더 큰 모델 (정확도 향상, 속도 저하)
const large = new TransformersEmbeddingProvider(
  'large',
  'Xenova/all-mpnet-base-v2',
  768, // 차원 증가
  logger,
);
```

### 2. 벡터 저장 최적화

Float32Array는 메모리 효율적이지만, 더 압축하려면:

```typescript
// Float32 → Float16 변환 (50% 메모리 절약)
function compressVector(vec: Float32Array): Uint8Array {
  const compressed = new Uint8Array(vec.length * 2);
  for (let i = 0; i < vec.length; i++) {
    const f16 = floatToHalf(vec[i] ?? 0);
    compressed[i * 2] = f16 & 0xff;
    compressed[i * 2 + 1] = (f16 >> 8) & 0xff;
  }
  return compressed;
}

// Float16 → Float32 복원
function decompressVector(compressed: Uint8Array): Float32Array {
  const vec = new Float32Array(compressed.length / 2);
  for (let i = 0; i < vec.length; i++) {
    const f16 = compressed[i * 2]! | (compressed[i * 2 + 1]! << 8);
    vec[i] = halfToFloat(f16);
  }
  return vec;
}

// Float32 → Float16 변환 (간단 구현)
function floatToHalf(val: number): number {
  // IEEE 754 half-precision 변환 로직
  // (생략 - 라이브러리 사용 권장)
  return 0;
}

function halfToFloat(val: number): number {
  // Float16 → Float32 변환 로직
  return 0;
}
```

### 3. 캐싱 전략

자주 사용하는 임베딩은 캐시:

```typescript
class CachedEmbeddingProvider {
  private cache = new Map<string, Float32Array>();

  constructor(private provider: TransformersEmbeddingProvider) {}

  async embedQuery(query: string): Promise<Result<Float32Array>> {
    // 캐시 확인
    const cached = this.cache.get(query);
    if (cached) {
      return ok(cached);
    }

    // 캐시 미스 — 실제 임베딩
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

## 🔗 관련 모듈

- **VectorStore** (`src/rag/vector-store.ts`) - LanceDB 벡터 저장소
- **CodeIndexer** (`src/rag/code-indexer.ts`) - 코드베이스 인덱싱
- **Logger** (`src/core/logger.ts`) - 로깅
- **Result 패턴** (`src/core/types.ts`) - 에러 처리

---

## ✅ 체크리스트

Embeddings를 사용하기 전에:
- [ ] Logger를 생성했나요?
- [ ] 첫 실행 시 네트워크 연결이 있나요?
- [ ] 디스크 공간이 충분한가요? (최소 100MB)
- [ ] Result 패턴으로 에러 처리를 했나요?
- [ ] 입력 텍스트가 너무 길지 않나요? (512 토큰 이하 권장)

---

**마지막 업데이트:** 2026-03-04
**작성자:** documenter 에이전트
**모델:** all-MiniLM-L6-v2 (384차원)
