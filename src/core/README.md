# core 모듈

의존성 없는 기반 모듈. 모든 다른 모듈이 의존.

## 파일 구조

```
src/core/
├── errors.ts      — AdevError 기반 에러 계층
├── types.ts       — Result<T,E>, Phase, AgentName 등 공유 타입
├── config.ts      — process.env 유일 진입점. 설정 스키마 검증
├── logger.ts      — 구조화된 로깅 (console.log 대체)
├── memory.ts      — LanceDB 메모리 repository
├── plugin-loader.ts — ~/.adev/ 커스텀 모듈 동적 로드
└── index.ts       — public API re-export
```

## 규칙

- 다른 모듈 import 금지 (순수 독립)
- process.env 접근은 config.ts에서만
- console.log 사용 금지 (logger.ts 사용)
