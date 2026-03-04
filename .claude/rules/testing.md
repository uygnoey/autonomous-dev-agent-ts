---
globs: "tests/**/*.test.ts"
---

# 테스트 규칙

## 프레임워크
- `bun test` 사용 (vitest/jest 금지)
- `import { describe, it, expect, beforeEach, afterEach } from 'bun:test'`

## 패턴
- Arrange-Act-Assert 구조
- describe: 대상, it: 행위 + 기대 결과
- 테스트 간 상태 공유 금지 (beforeEach로 초기화)

## Fail-Fast
- 1개라도 실패 → 즉시 중단 → 수정 → 해당 단계 처음부터
- 다 돌리고 수정 절대 금지

## 비율
- random/edge case 비중 80%+
- normal case는 20% 이내

## 파일 위치
- tests/unit/{모듈명}/{대상}.test.ts
- tests/module/{통합명}.test.ts
- tests/e2e/{시나리오}.test.ts

## 금지
- test.skip, test.todo (미완성 커밋 금지)
- snapshot 테스트 (깨지기 쉬움)
- sleep/setTimeout 기반 테스트 (flaky)
