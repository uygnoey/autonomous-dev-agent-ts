---
globs: "src/**/*.ts"
---

# TypeScript 코드 스타일

## 모듈
- ES Modules only (`import`/`export`). CommonJS (`require`) 금지
- 파일명: kebab-case (`agent-spawner.ts`)
- 인터페이스/타입: PascalCase. 변수/함수: camelCase. 상수: UPPER_SNAKE_CASE

## strict 타입
- `any` 사용 금지. `unknown` → 타입 가드 → 안전 사용
- Result<T, E> 패턴 사용. `.value`는 `.ok === true` 확인 후에만 접근
- non-null assertion (`!`) 금지. optional chaining + nullish coalescing 사용

## 에러 처리
- `throw` 최소화. Result 패턴으로 반환
- 외부 라이브러리 호출은 try-catch → Result 래핑
- AdevError 계층 사용 (src/core/errors.ts)

## 파일 구조
- 300줄 초과 시 분할 필수
- 파일 1개 = 책임 1개
- public API는 index.ts에서 re-export

## JSDoc
- 모든 export에 JSDoc 작성
- @param, @returns, @throws (사용 시), @example 포함
- 인라인 주석: WHY만 (WHAT/HOW는 코드가 설명)

## console.log 금지
- src/core/logger.ts의 Logger 사용
