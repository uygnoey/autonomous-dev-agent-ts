# 4-Provider Tier 임베딩 상세

출처: adev-embedding-strategy.md, HuggingFace Transformers.js v3 블로그

## EmbeddingProvider 인터페이스

```typescript
interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly tier: 'free' | 'paid';
  embed(texts: string[]): Promise<Result<Float32Array[]>>;
  embedQuery(query: string): Promise<Result<Float32Array>>;
}
```

## Tier 1: 무료 (로컬)

### XenovaProvider

```typescript
class XenovaProvider implements EmbeddingProvider {
  readonly name = 'xenova-minilm';
  readonly dimensions = 384;
  readonly tier = 'free' as const;

  // @huggingface/transformers v3 사용
  // Bun 공식 지원 확인 (HuggingFace 블로그)
  // 모델: Xenova/all-MiniLM-L6-v2
  // 초기 로드 ~2s, 이후 ~50ms/batch
}
```

### JinaLocalProvider

```typescript
class JinaLocalProvider implements EmbeddingProvider {
  readonly name = 'jina-v3-local';
  readonly dimensions = 1024;
  readonly tier = 'free' as const;

  // Jina v3 로컬 실행
  // GPU 권장 (CPU에서도 동작하나 느림)
  // 비상업 라이선스 주의
}
```

## Tier 2: 유료 (API)

### VoyageLiteProvider

```typescript
class VoyageLiteProvider implements EmbeddingProvider {
  readonly name = 'voyage-3-lite';
  readonly dimensions = 512;
  readonly tier = 'paid' as const;

  // VOYAGE_API_KEY 환경변수 필요
  // 범용 텍스트 임베딩
}
```

### VoyageCodeProvider

```typescript
class VoyageCodeProvider implements EmbeddingProvider {
  readonly name = 'voyage-code-3';
  readonly dimensions = 1024;
  readonly tier = 'paid' as const;

  // 코드 특화 임베딩
  // code_index 테이블에 권장
}
```

## 설정

```json
{
  "embedding": {
    "default": "xenova-minilm",
    "code": "xenova-minilm",
    "voyage_api_key": null
  }
}
```

유료 API 키 설정 시 자동으로 해당 provider 사용. 미설정 시 무료 Tier 1만 사용.

## 규칙

- 임베딩 provider 변경 시 기존 벡터 재인덱싱 필요 (차원 불일치)
- 같은 테이블 내 서로 다른 provider 혼용 금지
- provider 변경은 config에서만. 코드에 하드코딩 금지
