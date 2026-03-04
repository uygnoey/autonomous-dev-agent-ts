# 4-Provider 임베딩 전략

## EmbeddingProvider 인터페이스

```typescript
interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<Result<Float32Array[]>>;
  embedQuery(query: string): Promise<Result<Float32Array>>;
}
```

## Tier 1: 무료 (로컬)

| Provider | 모델 | 차원 | 용도 |
|---|---|---|---|
| Xenova | all-MiniLM-L6-v2 | 384 | 일반 텍스트 |
| Jina | jina-embeddings-v3 | 1024 | 코드 + 다국어 |

로컬 실행. API 키 불필요. @huggingface/transformers v3 사용.

## Tier 2: 유료 (API)

| Provider | 모델 | 차원 | 용도 |
|---|---|---|---|
| Voyage | voyage-4-lite | 1024 | 일반 텍스트 |
| Voyage | voyage-code-3 | 1024 | 코드 특화 |

VOYAGE_API_KEY 환경변수 필요.

## 선택 로직

```
VOYAGE_API_KEY 존재?
  YES → 코드: voyage-code-3, 텍스트: voyage-4-lite
  NO  → 코드: jina-v3, 텍스트: xenova-minilm
```

## LanceDB 테이블별 Provider

| 테이블 | Tier 1 | Tier 2 |
|---|---|---|
| memory | xenova | voyage-4-lite |
| code_index | jina-v3 | voyage-code-3 |
| design_decisions | xenova | voyage-4-lite |
| failures | xenova | voyage-4-lite |
