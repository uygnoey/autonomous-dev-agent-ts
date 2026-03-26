/**
 * 설정 스키마 및 타입 정의 / Configuration schema and type definitions
 *
 * @description
 * KR: adev 설정의 모든 타입 정의와 기본값을 담당한다.
 * EN: Contains all type definitions and default values for adev configuration.
 */

// ── 모델 상수 / Model Constants ──────────────────────────────────

/** 기본 Claude 모델 / Default Claude model */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-20250514';

/** 검증용 경량 모델 / Lightweight verification model */
export const DEFAULT_VERIFIER_MODEL = 'claude-haiku-4-5-20251001';

/** 기본 최대 토큰 / Default max tokens */
export const DEFAULT_MAX_TOKENS = 4096;

// ── 타입 정의 / Type Definitions ────────────────────────────────

/** 인증 방식 / Authentication mode */
export type AuthMode = 'api-key' | 'oauth-token';

/** 환경변수에서 읽은 인증 정보 / Authentication info from environment */
export interface EnvironmentVars {
  readonly authMode: AuthMode;
  readonly anthropicApiKey: string | undefined;
  readonly claudeCodeOauthToken: string | undefined;
}

/** 임베딩 설정 / Embedding configuration */
export interface EmbeddingConfig {
  readonly default: string;
  readonly code: string;
  readonly voyageApiKey: string | null;
}

/** 클린 환경 유형 / Clean environment type */
export type CleanEnvType = 'local' | 'cloud';

/** 테스트 수량 설정 / Testing configuration */
export interface TestingConfig {
  readonly unitCount: number;
  readonly moduleCount: number;
  readonly e2eCount: number;
  readonly integrationE2eCount: number;
  readonly parallelWorkers: number | 'auto';
  readonly e2eTimeoutSeconds: number;
  // WHY: PI-006 — §8.5 클라우드 환경 선택 지원. 현재는 로컬만 구현
  readonly cleanEnvType: CleanEnvType;
  /** 워커 메모리 한도 (MB) / Total memory limit for worker resolver (MB) */
  readonly totalMemoryMb: number;
}

/** 4중 검증 모델 설정 / Verification model configuration */
export interface VerificationConfig {
  readonly layer1Model: 'opus' | 'sonnet';
  readonly adevModel: 'opus' | 'sonnet';
  readonly opusEscalationOnFailure: boolean;
}

/** 로그 설정 / Log configuration */
export interface LogConfig {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
}

/** 인증 설정 / Authentication configuration */
export interface AuthConfig {
  /** 구독 플랜 (PI-006 — §11.1 플랜별 추정 한도) / Subscription plan */
  readonly subscriptionPlan?: 'pro' | 'max5x' | 'max20x';
}

/** 전체 설정 스키마 / Full configuration schema */
export interface ConfigSchema {
  readonly embedding: EmbeddingConfig;
  readonly testing: TestingConfig;
  readonly verification: VerificationConfig;
  readonly log: LogConfig;
  readonly auth?: AuthConfig;
}

/** 깊은 Partial 타입 / Deep partial type */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ── 기본값 / Defaults ───────────────────────────────────────────

/** 기본 설정 / Default configuration */
export const DEFAULT_CONFIG: ConfigSchema = {
  embedding: {
    default: 'xenova-minilm',
    code: 'xenova-minilm',
    voyageApiKey: null,
  },
  testing: {
    unitCount: 10_000,
    moduleCount: 10_000,
    e2eCount: 100_000,
    integrationE2eCount: 1_000_000,
    parallelWorkers: 'auto',
    e2eTimeoutSeconds: 300,
    cleanEnvType: 'local',
    totalMemoryMb: 4096,
  },
  verification: {
    layer1Model: 'opus',
    adevModel: 'opus',
    opusEscalationOnFailure: true,
  },
  log: {
    level: 'info',
  },
};
