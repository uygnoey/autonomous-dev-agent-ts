---
name: rag-integration
description: LanceDB 벡터 DB, 4-Provider Tier 임베딩, 코드 인덱싱. rag 모듈 구현 시 참조.
---

# RAG 통합

## LanceDB

임베디드, 서버리스, 파일 기반 벡터 DB. `@lancedb/lancedb` 패키지.
벡터 검색 + 풀텍스트(BM25) + SQL 필터링 지원.

테이블 4개:
1. `memory` — 대화/결정/피드백/에러
2. `code_index` — 코드베이스 청크
3. `design_decisions` — 설계 결정 이력
4. `failures` — 실패 이력 + 해결책

스키마 상세: `references/lancedb-schemas.md`

## 4-Provider Tier 임베딩

EmbeddingProvider 인터페이스로 추상화. 설정으로 전환.

| Tier | 제공자 | 차원 | 비용 |
|------|--------|------|------|
| 1-무료 | Xenova all-MiniLM-L6-v2 (`@huggingface/transformers` v3) | 384 | 무료 |
| 1-무료 | Jina v3 로컬 | 1024 | 무료 |
| 2-유료 | Voyage voyage-3-lite | 512 | 유료 |
| 2-유료 | Voyage voyage-code-3 | 1024 | 유료 |

상세: `references/embedding-tiers.md`

## 검색 전략

하이브리드 검색: 벡터 유사도 + BM25 + 메타데이터 필터 조합.
Progressive Disclosure: 요약 먼저 → 상세 필요 시 청크 로드.
