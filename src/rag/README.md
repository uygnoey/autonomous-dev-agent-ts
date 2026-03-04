# rag 모듈

LanceDB 벡터 DB + 임베딩 + 코드 인덱싱 + 하이브리드 검색.

## 파일 구조

```
src/rag/
├── types.ts         — EmbeddingProvider 인터페이스, SearchResult
├── embeddings.ts    — 4-Provider Tier 구현
├── vector-store.ts  — LanceDB 4 테이블 관리
├── chunk-splitter.ts — 코드/텍스트 청킹
├── code-indexer.ts  — 파일 스캔 → 청킹 → 임베딩 → 인덱싱
├── search.ts        — 하이브리드 검색 (벡터 + BM25 + SQL)
├── vectorizer.ts    — 상위 API (인덱싱 + 검색 통합)
└── index.ts         — public API
```

## 의존성

- core (config, errors, types, memory)

## LanceDB 테이블 4개

- memory: 대화/결정 기억
- code_index: 코드 벡터 인덱스
- design_decisions: 설계 결정 기록
- failures: 실패 이력
