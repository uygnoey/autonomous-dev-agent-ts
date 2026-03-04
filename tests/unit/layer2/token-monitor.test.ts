/**
 * TokenMonitor 단위 테스트 / TokenMonitor unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import type { AuthProvider, RateLimitStatus } from '../../../src/auth/types.js';
import type { Result } from '../../../src/core/types.js';
import { ok } from '../../../src/core/types.js';
import { TokenMonitor } from '../../../src/layer2/token-monitor.js';

/**
 * AuthProvider 모의 객체 / Mock AuthProvider
 */
function createMockAuthProvider(status: RateLimitStatus): AuthProvider {
  return {
    authMode: 'api-key',
    getAuthHeader: () => ({ Authorization: 'Bearer test' }),
    getRateLimitStatus: () => status,
    updateFromResponse: (): Result<void> => ok(undefined),
  };
}

describe('TokenMonitor', () => {
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger('error');
  });

  describe('shouldThrottleSpawn / 스폰 스로틀링', () => {
    it('잔여 요청이 20% 이하일 때 true를 반환한다', () => {
      const provider = createMockAuthProvider({
        requestsRemaining: 10,
        inputTokensRemaining: null,
        outputTokensRemaining: null,
        retryAfterSeconds: null,
        isLimitApproaching: false,
      });
      const monitor = new TokenMonitor(provider, logger);
      expect(monitor.shouldThrottleSpawn()).toBe(true);
    });

    it('잔여 요청이 충분할 때 false를 반환한다', () => {
      const provider = createMockAuthProvider({
        requestsRemaining: 80,
        inputTokensRemaining: null,
        outputTokensRemaining: null,
        retryAfterSeconds: null,
        isLimitApproaching: false,
      });
      const monitor = new TokenMonitor(provider, logger);
      expect(monitor.shouldThrottleSpawn()).toBe(false);
    });

    it('isLimitApproaching이 true일 때 true를 반환한다', () => {
      const provider = createMockAuthProvider({
        requestsRemaining: null,
        inputTokensRemaining: null,
        outputTokensRemaining: null,
        retryAfterSeconds: null,
        isLimitApproaching: true,
      });
      const monitor = new TokenMonitor(provider, logger);
      expect(monitor.shouldThrottleSpawn()).toBe(true);
    });
  });

  describe('shouldPauseAll / 전체 일시 정지', () => {
    it('잔여 요청이 5% 이하일 때 true를 반환한다', () => {
      const provider = createMockAuthProvider({
        requestsRemaining: 3,
        inputTokensRemaining: null,
        outputTokensRemaining: null,
        retryAfterSeconds: null,
        isLimitApproaching: false,
      });
      const monitor = new TokenMonitor(provider, logger);
      expect(monitor.shouldPauseAll()).toBe(true);
    });

    it('retryAfterSeconds가 설정되었을 때 true를 반환한다', () => {
      const provider = createMockAuthProvider({
        requestsRemaining: 50,
        inputTokensRemaining: null,
        outputTokensRemaining: null,
        retryAfterSeconds: 30,
        isLimitApproaching: false,
      });
      const monitor = new TokenMonitor(provider, logger);
      expect(monitor.shouldPauseAll()).toBe(true);
    });

    it('충분한 잔여량이 있을 때 false를 반환한다', () => {
      const provider = createMockAuthProvider({
        requestsRemaining: 80,
        inputTokensRemaining: null,
        outputTokensRemaining: null,
        retryAfterSeconds: null,
        isLimitApproaching: false,
      });
      const monitor = new TokenMonitor(provider, logger);
      expect(monitor.shouldPauseAll()).toBe(false);
    });

    it('정보가 없을 때 (null) false를 반환한다', () => {
      const provider = createMockAuthProvider({
        requestsRemaining: null,
        inputTokensRemaining: null,
        outputTokensRemaining: null,
        retryAfterSeconds: null,
        isLimitApproaching: false,
      });
      const monitor = new TokenMonitor(provider, logger);
      expect(monitor.shouldPauseAll()).toBe(false);
    });
  });

  describe('getStatus / 상태 조회', () => {
    it('AuthProvider의 상태를 반환한다', () => {
      const status: RateLimitStatus = {
        requestsRemaining: 50,
        inputTokensRemaining: 1000,
        outputTokensRemaining: 500,
        retryAfterSeconds: null,
        isLimitApproaching: false,
      };
      const provider = createMockAuthProvider(status);
      const monitor = new TokenMonitor(provider, logger);

      const result = monitor.getStatus();
      expect(result.requestsRemaining).toBe(50);
      expect(result.inputTokensRemaining).toBe(1000);
    });
  });

  describe('updateFromResponse / 응답 갱신', () => {
    it('AuthProvider에 위임한다', () => {
      const provider = createMockAuthProvider({
        requestsRemaining: 50,
        inputTokensRemaining: null,
        outputTokensRemaining: null,
        retryAfterSeconds: null,
        isLimitApproaching: false,
      });
      const monitor = new TokenMonitor(provider, logger);

      const result = monitor.updateFromResponse({ 'x-ratelimit-remaining': '40' });
      expect(result.ok).toBe(true);
    });
  });
});
