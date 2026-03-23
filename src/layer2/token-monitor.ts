/**
 * 토큰 모니터 / Token Monitor
 *
 * @description
 * KR: AuthProvider의 레이트 리밋 상태를 감시하여
 *     에이전트 스폰 스로틀링/일시 정지 결정을 내린다.
 * EN: Monitors AuthProvider rate limit status to decide
 *     agent spawn throttling and pause decisions.
 */

import type { AuthProvider, RateLimitStatus } from 'auth/types.js';
import type { AuthMode } from 'core/config.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';

/**
 * 스로틀 임계값: 잔여량이 전체의 20% 이하일 때 / Throttle when remaining <= 20% of limit
 */
const THROTTLE_THRESHOLD = 0.2;

/**
 * 일시 정지 임계값: 잔여량이 전체의 5% 이하일 때 / Pause when remaining <= 5% of limit
 */
const PAUSE_THRESHOLD = 0.05;

/**
 * 토큰 모니터 / Token Monitor
 *
 * @description
 * KR: 레이트 리밋 상태를 추적하고 스폰 결정에 활용한다.
 * EN: Tracks rate limit status and provides spawn decisions.
 *
 * @example
 * const monitor = new TokenMonitor(authProvider, logger);
 * if (monitor.shouldThrottleSpawn()) logger.warn('스폰 스로틀링 필요');
 */
export class TokenMonitor {
  private readonly authProvider: AuthProvider;
  private readonly logger: Logger;

  /**
   * @param authProvider - 인증 공급자 / Authentication provider
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(authProvider: AuthProvider, logger: Logger) {
    this.authProvider = authProvider;
    this.logger = logger.child({ module: 'token-monitor' });
  }

  /**
   * API 응답으로부터 레이트 리밋 정보를 갱신한다 / Updates rate limit from API response
   *
   * @param headers - HTTP 응답 헤더 / HTTP response headers
   * @param body - HTTP 응답 본문 (선택) / HTTP response body (optional)
   * @returns 항상 ok / Always ok
   */
  updateFromResponse(headers: Record<string, string>, body?: unknown): Result<void> {
    const result = this.authProvider.updateFromResponse(headers, body);
    if (!result.ok) {
      this.logger.warn('레이트 리밋 갱신 실패', { error: result.error.message });
    }
    return ok(undefined);
  }

  /**
   * 에이전트 스폰을 스로틀해야 하는지 판단한다 / Whether agent spawn should be throttled
   *
   * @description
   * KR: 잔여 요청 또는 출력 토큰이 20% 이하면 스로틀링 필요.
   * EN: Throttle needed when remaining requests or output tokens <= 20%.
   *
   * @returns 스로틀 필요 여부 / Whether throttling is needed
   */
  shouldThrottleSpawn(): boolean {
    const status = this.getStatus();
    const ratio = this.calculateRemainingRatio(status);

    if (ratio !== null && ratio <= THROTTLE_THRESHOLD) {
      this.logger.warn('스폰 스로틀링 권장', { remainingRatio: ratio });
      return true;
    }

    return status.isLimitApproaching;
  }

  /**
   * 모든 에이전트를 일시 정지해야 하는지 판단한다 / Whether all agents should be paused
   *
   * @description
   * KR: 잔여 요청 또는 출력 토큰이 5% 이하면 전체 일시 정지 필요.
   * EN: Pause all when remaining requests or output tokens <= 5%.
   *
   * @returns 전체 일시 정지 필요 여부 / Whether all agents should pause
   */
  shouldPauseAll(): boolean {
    const status = this.getStatus();
    const ratio = this.calculateRemainingRatio(status);

    if (ratio !== null && ratio <= PAUSE_THRESHOLD) {
      this.logger.error('전체 일시 정지 권장', { remainingRatio: ratio });
      return true;
    }

    if (status.retryAfterSeconds !== null && status.retryAfterSeconds > 0) {
      this.logger.error('429 발생 — 전체 일시 정지', {
        retryAfterSeconds: status.retryAfterSeconds,
      });
      return true;
    }

    return false;
  }

  /**
   * 현재 인증 방식을 반환한다 / Returns current authentication mode
   *
   * @returns 인증 방식 / Authentication mode
   */
  get authMode(): AuthMode {
    return this.authProvider.authMode;
  }

  /**
   * 현재 레이트 리밋 상태를 반환한다 / Returns current rate limit status
   *
   * @returns 레이트 리밋 스냅샷 / Rate limit snapshot
   */
  getStatus(): RateLimitStatus {
    return this.authProvider.getRateLimitStatus();
  }

  /**
   * 토큰 리셋 시점까지 대기한다 / Wait until token usage resets
   *
   * @description
   * KR: shouldPauseAll()이 false가 될 때까지 intervalMs 간격으로 폴링한다.
   *     retryAfterSeconds가 설정되어 있으면 해당 시간만큼 대기 후 폴링 시작.
   * EN: Polls at intervalMs until shouldPauseAll() returns false.
   *     If retryAfterSeconds is set, waits that duration before polling.
   *
   * @param intervalMs - 폴링 간격 (밀리초, 기본 5000) / Polling interval in ms (default 5000)
   * @returns 리셋 완료 시 resolve / Resolves when token usage resets
   */
  async waitForReset(intervalMs = 5000): Promise<void> {
    const status = this.getStatus();

    // WHY: retryAfterSeconds가 있으면 해당 시간만큼 먼저 대기하여 불필요한 폴링 방지
    if (status.retryAfterSeconds !== null && status.retryAfterSeconds > 0) {
      const waitMs = status.retryAfterSeconds * 1000;
      this.logger.info('retryAfter 대기 시작', { waitMs });
      await this.sleep(waitMs);
    }

    while (this.shouldPauseAll()) {
      this.logger.debug('토큰 리셋 대기 중', { intervalMs });
      await this.sleep(intervalMs);
    }

    this.logger.info('토큰 리셋 완료 — 재개 가능');
  }

  /**
   * 잔여량 비율을 계산한다 / Calculates remaining ratio
   *
   * @description
   * KR: 잔여 요청 수를 기반으로 비율을 계산한다.
   *     정보가 없으면 null을 반환한다 (안전 측으로 판단).
   * EN: Calculates ratio based on remaining requests.
   *     Returns null if info unavailable (defaults to safe).
   *
   * @param status - 레이트 리밋 상태 / Rate limit status
   * @returns 잔여 비율 (0~1) 또는 null / Remaining ratio (0~1) or null
   */
  private calculateRemainingRatio(status: RateLimitStatus): number | null {
    // WHY: requestsRemaining이 null이면 정보 없음 → 비율 계산 불가
    if (status.requestsRemaining === null) {
      return null;
    }

    // WHY: requestsLimit이 null이면 한도 정보 없음 → 비율 계산 불가
    if (status.requestsLimit === null) {
      return null;
    }

    // WHY: 한도가 0 이하이면 비율 계산 무의미
    if (status.requestsLimit <= 0) {
      return null;
    }

    return Math.min(status.requestsRemaining / status.requestsLimit, 1);
  }

  /**
   * 지정된 밀리초만큼 대기한다 / Sleep for given milliseconds
   *
   * @param ms - 대기 시간 (밀리초) / Sleep duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
