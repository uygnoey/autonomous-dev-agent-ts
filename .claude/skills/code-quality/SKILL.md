---
name: code-quality-standards
description: 코드 품질 기준, Result 패턴, 에러 처리, 리뷰 체크리스트. 모든 코드 작성 시 참조.
---

# 코드 품질 기준

## Result<T, E> 패턴

모든 실패 가능한 함수는 throw 대신 `Result<T, E>`를 반환한다.

```typescript
type Result<T, E = AdevError> = { ok: true; value: T } | { ok: false; error: E };

// 사용
function parseConfig(raw: string): Result<Config, ConfigError> {
  // ...
  return { ok: true, value: config };
  // 또는
  return { ok: false, error: new ConfigError('invalid_format', 'JSON 파싱 실패') };
}
```

throw는 복구 불가능한 프로그래밍 오류에만 사용. 경계(외부 라이브러리 호출)에서만 try-catch.

상세: `references/result-pattern.md`

## 디자인 패턴

- 의존성 주입: 생성자 파라미터로 주입. new 직접 호출은 팩토리/컴포지션 루트에서만
- 인터페이스 우선: 구현 전 interface 정의. 파일 분리 (`types.ts`)
- EventEmitter: Phase 전환, 에이전트 완료 등 비동기 이벤트
- Repository: LanceDB 접근은 repository 클래스 경유

## 에러 처리 계층

```
AdevError (기본)
├── ConfigError — 설정 관련
├── AuthError — 인증 관련
├── RagError — RAG/임베딩/LanceDB
├── AgentError — 에이전트 실행/통신
├── PhaseError — Phase 전환/검증
├── ContractError — Contract 검증
└── McpError — MCP 서버 관련
```

상세: `references/error-handling.md`

## 리뷰 체크리스트

코드 리뷰 시 확인 항목 → `references/review-checklist.md`
