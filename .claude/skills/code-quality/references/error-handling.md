# 에러 처리 상세

## AdevError 기본 클래스

```typescript
class AdevError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

## 에러 분류

| 에러 타입 | 코드 접두사 | 예시 |
|----------|-----------|------|
| ConfigError | `config_` | `config_missing_key`, `config_invalid_value` |
| AuthError | `auth_` | `auth_no_credential`, `auth_expired`, `auth_rate_limited` |
| RagError | `rag_` | `rag_embed_failed`, `rag_db_error`, `rag_index_corrupt` |
| AgentError | `agent_` | `agent_spawn_failed`, `agent_timeout`, `agent_stream_error` |
| PhaseError | `phase_` | `phase_invalid_transition`, `phase_gate_failed` |
| ContractError | `contract_` | `contract_validation_failed`, `contract_missing_field` |
| McpError | `mcp_` | `mcp_server_crash`, `mcp_tool_error` |

## 재시도 전략

```typescript
interface RetryPolicy {
  maxAttempts: number;
  baseDelay: number;     // ms
  maxDelay: number;      // ms
  backoffFactor: number; // 지수 백오프 배수
  retryableErrors: string[]; // 재시도 가능한 에러 코드
}

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  retryableErrors: ['auth_rate_limited', 'agent_timeout', 'rag_db_error'],
};
```

## 계층별 에러 처리

- **core**: AdevError 정의만. 직접 catch 안 함
- **auth/rag/mcp**: 외부 라이브러리 catch → 도메인 에러로 변환 → Result 반환
- **layer1/2/3**: 하위 모듈 Result 확인 → 실패 시 로깅 + 적절한 에러 전파
- **cli**: 최종 catch → 유저 친화적 메시지 출력 + process.exit(1)
