/**
 * ProductionTester 타입 정의 / ProductionTester type definitions
 *
 * @description
 * KR: ProductionTester에서 사용하는 인터페이스/타입 정의 모음.
 * EN: Interface and type definitions used by ProductionTester.
 */

import type { Result } from 'core/types.js';

/**
 * 지속 E2E 실행 상태 / Continuous E2E execution status
 *
 * @description
 * KR: 세션의 현재 상태를 나타낸다.
 * EN: Represents the current state of a session.
 */
export type ContinuousE2EStatus = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * 지속 E2E 설정 / Continuous E2E configuration
 *
 * @description
 * KR: 지속 E2E 실행에 필요한 설정 정보.
 * EN: Configuration for continuous E2E execution.
 */
export interface ContinuousE2EConfig {
  /** E2E 테스트 경로 / E2E test path */
  readonly testPath: string;
  /** 실행 간격 (ms) / Execution interval in milliseconds */
  readonly intervalMs: number;
  /** Fail-Fast 활성화 / Enable fail-fast */
  readonly failFast: boolean;
}

/**
 * 지속 E2E 세션 / Continuous E2E session
 *
 * @description
 * KR: 실행 중인 지속 E2E 세션의 상태와 통계를 담는다.
 * EN: Holds state and statistics of a running continuous E2E session.
 */
export interface ContinuousE2ESession {
  /** 세션 ID / Session ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 프로젝트 절대 경로 / Project absolute path (cwd for bun test) */
  readonly projectPath: string;
  /** 설정 / Configuration */
  readonly config: ContinuousE2EConfig;
  /** 상태 / Status */
  status: ContinuousE2EStatus;
  /** 총 실행 횟수 / Total execution count */
  totalExecutions: number;
  /** 성공 횟수 / Success count */
  successCount: number;
  /** 실패 횟수 / Failure count */
  failureCount: number;
  /** 시작 시각 / Started at */
  readonly startedAt: Date;
  /** 최종 실행 시각 / Last executed at */
  lastExecutedAt?: Date;
}

/**
 * 지속 E2E 실행 옵션 / Continuous E2E execution options
 *
 * @description
 * KR: 지속 E2E 실행을 시작할 때 필요한 옵션.
 * EN: Options required to start continuous E2E execution.
 */
export interface StartContinuousE2EOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 프로젝트 절대 경로 / Project absolute path (cwd for bun test) */
  readonly projectPath: string;
  /** E2E 테스트 경로 / E2E test path */
  readonly testPath: string;
  /** 실행 간격 (ms, 기본: 5분) / Execution interval in milliseconds (default: 5min) */
  readonly intervalMs?: number;
  /** Fail-Fast 활성화 (기본: true) / Enable fail-fast (default: true) */
  readonly failFast?: boolean;
}

/**
 * 지속 E2E 테스터 인터페이스 / Continuous E2E tester interface
 *
 * @description
 * KR: 지속적 E2E 실행을 관리하는 인터페이스.
 * EN: Interface for managing continuous E2E execution.
 */
export interface IProductionTester {
  /**
   * 지속 E2E 실행을 시작한다 / Start continuous E2E execution
   *
   * @param options - 실행 옵션 / Execution options
   * @returns 세션 / Session
   */
  start(options: StartContinuousE2EOptions): Promise<Result<ContinuousE2ESession>>;

  /**
   * 지속 E2E 실행을 중지한다 / Stop continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  stop(sessionId: string): Promise<Result<void>>;

  /**
   * 지속 E2E 실행을 일시 정지한다 / Pause continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  pause(sessionId: string): Promise<Result<void>>;

  /**
   * 지속 E2E 실행을 재개한다 / Resume continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  resume(sessionId: string): Promise<Result<void>>;

  /**
   * 세션 상태를 조회한다 / Get session status
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 세션 / Session
   */
  getSession(sessionId: string): Promise<Result<ContinuousE2ESession>>;

  /**
   * 모든 활성 세션을 조회한다 / List all active sessions
   *
   * @returns 세션 배열 / Session array
   */
  listSessions(): Promise<Result<readonly ContinuousE2ESession[]>>;
}
