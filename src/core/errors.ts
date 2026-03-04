/**
 * adev 에러 계층 구조 / AdevError hierarchy
 *
 * @description
 * 프로젝트 전체에서 사용하는 에러 기반 클래스와 도메인별 서브클래스.
 * 모든 에러는 AdevError를 상속하며, code 필드로 세부 분류한다.
 */

/**
 * 프로젝트 전역 에러 기반 클래스 / Base error class for adev
 *
 * @param code - 에러 분류 코드 (예: 'config_missing_key')
 * @param message - 사람이 읽을 수 있는 에러 메시지
 * @param cause - 원인이 된 원본 에러 (외부 라이브러리 에러 래핑용)
 *
 * @example
 * throw new AdevError('unknown_error', '알 수 없는 에러 발생');
 */
export class AdevError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** 설정 관련 에러 (접두사: config_) */
export class ConfigError extends AdevError {}

/** 인증 관련 에러 (접두사: auth_) */
export class AuthError extends AdevError {}

/** RAG/벡터DB 관련 에러 (접두사: rag_) */
export class RagError extends AdevError {}

/** 에이전트 실행 관련 에러 (접두사: agent_) */
export class AgentError extends AdevError {}

/** Phase 전환 관련 에러 (접두사: phase_) */
export class PhaseError extends AdevError {}

/** Contract 검증 관련 에러 (접두사: contract_) */
export class ContractError extends AdevError {}

/** MCP 서버 관련 에러 (접두사: mcp_) */
export class McpError extends AdevError {}

/** Layer3 관련 에러 (접두사: layer3_) */
export class Layer3Error extends AdevError {}

/**
 * AdevError 타입 가드 / Type guard for AdevError
 *
 * @param error - 검사할 unknown 값
 * @returns error가 AdevError 인스턴스이면 true
 *
 * @example
 * if (isAdevError(caught)) {
 *   console.error(caught.code, caught.message);
 * }
 */
export function isAdevError(error: unknown): error is AdevError {
  return error instanceof AdevError;
}

/**
 * 재시도 정책 인터페이스 / Retry policy configuration
 *
 * @param maxAttempts - 최대 시도 횟수
 * @param baseDelay - 기본 대기 시간 (ms)
 * @param maxDelay - 최대 대기 시간 (ms)
 * @param backoffFactor - 지수 백오프 배율
 * @param retryableErrors - 재시도 가능한 에러 코드 목록
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly backoffFactor: number;
  readonly retryableErrors: readonly string[];
}

/** 기본 재시도 정책 / Default retry policy */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelay: 1_000,
  maxDelay: 30_000,
  backoffFactor: 2,
  retryableErrors: ['auth_rate_limited', 'agent_timeout', 'rag_db_error'],
};
