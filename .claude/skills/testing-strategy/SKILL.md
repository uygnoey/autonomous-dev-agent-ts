---
name: testing-strategy
description: Fail-Fast 원칙, 계단식 통합 검증, 테스트 수량. 테스트 관련 코드 구현 시 참조.
---

# 테스트 전략

## Fail-Fast 원칙 (절대 규칙)

1개라도 실패 → 즉시 중단 → 수정 → 해당 단계 처음부터 재실행.
다 돌리고 수정 금지. 실패 원인이 뒤엉켜 추적 불가.

## 기능 모드 (2계층-A)

유형 정의서 기반 테스트 케이스 생성 후 순차 실행:
1. Unit 10,000 → 1개 실패 → 즉시 중단
2. Unit 전체 통과 → Module 10,000
3. Module 전체 통과 → E2E 100,000+
- random 비중 80%+

## 통합 모드 (2계층-B) — 계단식 Fail-Fast

Step 1: 수정된 기능 E2E 100,000+ (전체)
Step 2: 연관 기능 E2E 10,000 (회귀)
Step 3: 비연관 기능 E2E 1,000 (스모크)
Step 4: 전부 통과 → 통합 E2E 1,000,000 최종 1회
- 각 Step 중 1개 실패 → 즉시 중단 → 수정 → 해당 Step 처음부터

## 4중 검증

1. qa/qc: 스펙 준수 + 테스트 통과
2. reviewer: 코드 품질 + 패턴 준수
3. 1계층: 의도 기반 검증
4. adev: 위 3개 결과 종합 + 확증편향 체크

상세: `references/verification-flow.md`

## 테스트 코드 작성 규칙

- 프레임워크: Bun 내장 (`bun test`)
- 패턴: Arrange-Act-Assert
- 파일 위치: `tests/unit/`, `tests/module/`, `tests/e2e/`
- 네이밍: `{대상}.test.ts`
