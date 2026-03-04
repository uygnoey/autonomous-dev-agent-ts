# LanceDB 테이블 스키마

## 1. memory 테이블

```typescript
interface MemoryRecord {
  id: string;                  // UUID
  projectId: string;
  type: 'conversation' | 'decision' | 'feedback' | 'error';
  content: string;
  embedding: Float32Array;     // EmbeddingProvider.dimensions 크기
  metadata: {
    phase: Phase;
    featureId: string;
    agentName: string;
    timestamp: Date;
  };
}
```

## 2. code_index 테이블

```typescript
interface CodeRecord {
  id: string;
  projectId: string;
  filePath: string;
  chunk: string;               // 코드 청크
  embedding: Float32Array;
  metadata: {
    language: string;
    module: string;            // src/core, src/layer1 등
    functionName: string;
    lastModified: Date;
    modifiedBy: string;        // 에이전트 이름
  };
}
```

## 3. design_decisions 테이블

```typescript
interface DesignDecision {
  id: string;
  projectId: string;
  featureId: string;
  decision: string;            // 결정 내용
  rationale: string;           // 근거
  alternatives: string[];      // 검토한 대안들
  decidedBy: string[];         // 참여 에이전트 목록
  embedding: Float32Array;
  timestamp: Date;
}
```

## 4. failures 테이블

```typescript
interface FailureRecord {
  id: string;
  projectId: string;
  featureId: string;
  phase: Phase;
  failureType: string;         // 실패 분류
  rootCause: string;           // qc가 분석한 근본 원인
  resolution: string;          // 해결 방법
  embedding: Float32Array;
  timestamp: Date;
}
```

## Repository 패턴 적용

```typescript
interface VectorRepository<T> {
  insert(record: T): Promise<Result<void>>;
  search(query: Float32Array, limit: number, filter?: Record<string, unknown>): Promise<Result<T[]>>;
  getById(id: string): Promise<Result<T | null>>;
  update(id: string, partial: Partial<T>): Promise<Result<void>>;
  delete(id: string): Promise<Result<void>>;
}
```

각 테이블별 구현체: `MemoryRepository`, `CodeRepository`, `DesignRepository`, `FailureRepository`.
