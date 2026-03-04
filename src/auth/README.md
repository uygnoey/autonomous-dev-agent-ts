# auth 모듈

인증 관리. API key / Subscription 이중 모드.

## 파일 구조

```
src/auth/
├── types.ts             — AuthProvider 인터페이스, AuthMode
├── api-key-auth.ts      — ANTHROPIC_API_KEY 기반. rate limit 헤더 파싱
├── subscription-auth.ts — CLAUDE_CODE_OAUTH_TOKEN 기반. usage 누적
├── auth-manager.ts      — 환경변수 감지 → 적절한 Provider 생성
└── index.ts             — public API
```

## 의존성

- core (config, errors, types)

## 규칙

- credential 저장 금지 (환경변수에서만 읽기)
- 두 환경변수 동시 설정 시 에러
