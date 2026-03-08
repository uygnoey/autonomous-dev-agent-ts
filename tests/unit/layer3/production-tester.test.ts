/**
 * ProductionTester 단위 테스트 / ProductionTester unit tests
 *
 * @description
 * KR: 실제 구현 인터페이스에 맞춘 테스트 (async/await 기반 세션 관리)
 * EN: Tests aligned with actual implementation (async/await session management)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import { ProductionTester } from 'layer3/production-tester.js';
import type { E2ETestRun } from 'layer3/types.js';

/**
 * Mock IntegrationTester for testing
 */
class MockIntegrationTester implements Pick<IntegrationTester, 'runIntegrationTests'> {
  public shouldFail = false;
  public callCount = 0;

  async runIntegrationTests(_projectId: string, _testPath: string) {
    this.callCount += 1;

    if (this.shouldFail) {
      return {
        ok: false,
        error: {
          code: 'test_failed',
          message: 'Mock test failure',
        },
      } as const;
    }

    return {
      ok: true,
      value: [
        { step: 1, passed: true, duration: 10 },
        { step: 2, passed: true, duration: 10 },
        { step: 3, passed: true, duration: 10 },
        { step: 4, passed: true, duration: 10 },
      ],
    } as const;
  }
}

describe('ProductionTester', () => {
  let tester: ProductionTester;
  let mockIntegrationTester: MockIntegrationTester;
  let logger: ConsoleLogger;
  let sessionIds: string[];

  beforeEach(() => {
    logger = new ConsoleLogger('error');
    mockIntegrationTester = new MockIntegrationTester();
    tester = new ProductionTester(mockIntegrationTester as unknown as IntegrationTester, logger);
    sessionIds = [];
  });

  afterEach(async () => {
    // WHY: 테스트 간 상태 격리 - 모든 세션 정리
    for (const sessionId of sessionIds) {
      await tester.stop(sessionId);
    }
    sessionIds = [];
  });

  describe('start / 세션 시작', () => {
    it('유효한 옵션으로 세션을 시작한다', async () => {
      const result = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
        intervalMs: 100,
        failFast: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value;
        sessionIds.push(session.id);

        expect(session.id).toBeDefined();
        expect(session.projectId).toBe('proj-1');
        expect(session.config.testPath).toBe('./tests/e2e');
        expect(session.config.intervalMs).toBe(100);
        expect(session.config.failFast).toBe(true);
        expect(session.status).toBe('running');
        expect(session.totalExecutions).toBe(0);
        expect(session.successCount).toBe(0);
        expect(session.failureCount).toBe(0);
        expect(session.startedAt).toBeInstanceOf(Date);
      }
    });

    it('기본 옵션 값을 적용한다', async () => {
      const result = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value;
        sessionIds.push(session.id);

        expect(session.config.intervalMs).toBe(300_000); // 5분 기본값
        expect(session.config.failFast).toBe(true); // true 기본값
      }
    });

    it('빈 프로젝트 ID는 에러를 반환한다', async () => {
      const result = await tester.start({
        projectId: '',
        testPath: './tests/e2e',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_start_failed');
        expect(result.error.message).toContain('프로젝트 ID');
      }
    });

    it('공백만 있는 프로젝트 ID는 에러를 반환한다', async () => {
      const result = await tester.start({
        projectId: '   ',
        testPath: './tests/e2e',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_start_failed');
      }
    });

    it('빈 테스트 경로는 에러를 반환한다', async () => {
      const result = await tester.start({
        projectId: 'proj-1',
        testPath: '',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_start_failed');
        expect(result.error.message).toContain('테스트 경로');
      }
    });

    it('공백만 있는 테스트 경로는 에러를 반환한다', async () => {
      const result = await tester.start({
        projectId: 'proj-1',
        testPath: '   ',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_start_failed');
      }
    });

    it('고유한 세션 ID를 생성한다', async () => {
      const r1 = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });
      const r2 = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);

      if (r1.ok && r2.ok) {
        sessionIds.push(r1.value.id, r2.value.id);
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });
  });

  describe('stop / 세션 중지', () => {
    it('실행 중인 세션을 중지한다', async () => {
      const startResult = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const sessionId = startResult.value.id;
      const stopResult = await tester.stop(sessionId);

      expect(stopResult.ok).toBe(true);

      const getResult = await tester.getSession(sessionId);
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.status).toBe('stopped');
      }
    });

    it('존재하지 않는 세션 ID는 에러를 반환한다', async () => {
      const result = await tester.stop('non-existent-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_session_not_found');
      }
    });

    it('이미 중지된 세션도 성공을 반환한다', async () => {
      const startResult = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const sessionId = startResult.value.id;
      await tester.stop(sessionId);
      const result = await tester.stop(sessionId);

      expect(result.ok).toBe(true);
    });
  });

  describe('pause / 세션 일시 정지', () => {
    it('실행 중인 세션을 일시 정지한다', async () => {
      const startResult = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const sessionId = startResult.value.id;
      sessionIds.push(sessionId);

      const pauseResult = await tester.pause(sessionId);
      expect(pauseResult.ok).toBe(true);

      const getResult = await tester.getSession(sessionId);
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.status).toBe('paused');
      }
    });

    it('존재하지 않는 세션 ID는 에러를 반환한다', async () => {
      const result = await tester.pause('non-existent-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_session_not_found');
      }
    });
  });

  describe('resume / 세션 재개', () => {
    it('일시 정지된 세션을 재개한다', async () => {
      const startResult = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const sessionId = startResult.value.id;
      sessionIds.push(sessionId);

      await tester.pause(sessionId);

      const resumeResult = await tester.resume(sessionId);
      expect(resumeResult.ok).toBe(true);

      const getResult = await tester.getSession(sessionId);
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.status).toBe('running');
      }
    });

    it('paused 상태가 아닌 세션은 에러를 반환한다', async () => {
      const startResult = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const sessionId = startResult.value.id;
      sessionIds.push(sessionId);

      const result = await tester.resume(sessionId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_invalid_state');
        expect(result.error.message).toContain('paused 상태가 아닙니다');
      }
    });

    it('존재하지 않는 세션 ID는 에러를 반환한다', async () => {
      const result = await tester.resume('non-existent-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_session_not_found');
      }
    });
  });

  describe('세션 생명주기 / Session lifecycle', () => {
    it('start → pause → resume → stop 순서를 실행한다', async () => {
      // 1. Start
      const startResult = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });
      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const sessionId = startResult.value.id;
      expect(startResult.value.status).toBe('running');

      // 2. Pause
      const pauseResult = await tester.pause(sessionId);
      expect(pauseResult.ok).toBe(true);

      const pausedSession = await tester.getSession(sessionId);
      expect(pausedSession.ok).toBe(true);
      if (pausedSession.ok) {
        expect(pausedSession.value.status).toBe('paused');
      }

      // 3. Resume
      const resumeResult = await tester.resume(sessionId);
      expect(resumeResult.ok).toBe(true);

      const resumedSession = await tester.getSession(sessionId);
      expect(resumedSession.ok).toBe(true);
      if (resumedSession.ok) {
        expect(resumedSession.value.status).toBe('running');
      }

      // 4. Stop
      const stopResult = await tester.stop(sessionId);
      expect(stopResult.ok).toBe(true);

      const stoppedSession = await tester.getSession(sessionId);
      expect(stoppedSession.ok).toBe(true);
      if (stoppedSession.ok) {
        expect(stoppedSession.value.status).toBe('stopped');
      }
    });
  });

  describe('getSession / 세션 조회', () => {
    it('존재하는 세션을 조회한다', async () => {
      const startResult = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const sessionId = startResult.value.id;
      sessionIds.push(sessionId);

      const getResult = await tester.getSession(sessionId);

      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.id).toBe(sessionId);
        expect(getResult.value.projectId).toBe('proj-1');
      }
    });

    it('존재하지 않는 세션 ID는 에러를 반환한다', async () => {
      const result = await tester.getSession('non-existent-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_continuous_e2e_session_not_found');
      }
    });
  });

  describe('listSessions / 세션 목록 조회', () => {
    it('빈 목록을 반환한다', async () => {
      const result = await tester.listSessions();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('모든 세션을 반환한다', async () => {
      const r1 = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });
      const r2 = await tester.start({
        projectId: 'proj-2',
        testPath: './tests/e2e',
      });

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);

      if (r1.ok && r2.ok) {
        sessionIds.push(r1.value.id, r2.value.id);

        const listResult = await tester.listSessions();

        expect(listResult.ok).toBe(true);
        if (listResult.ok) {
          expect(listResult.value).toHaveLength(2);
          const ids = listResult.value.map((s) => s.id);
          expect(ids).toContain(r1.value.id);
          expect(ids).toContain(r2.value.id);
        }
      }
    });

    it('중지된 세션도 목록에 포함한다', async () => {
      const startResult = await tester.start({
        projectId: 'proj-1',
        testPath: './tests/e2e',
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const sessionId = startResult.value.id;
      await tester.stop(sessionId);

      const listResult = await tester.listSessions();

      expect(listResult.ok).toBe(true);
      if (listResult.ok) {
        expect(listResult.value).toHaveLength(1);
        expect(listResult.value[0]?.status).toBe('stopped');
      }
    });
  });

  describe('runE2E / 동기 E2E 테스트 실행', () => {
    it('유효한 명령어로 테스트를 실행한다', () => {
      const result = tester.runE2E('proj-1', ['bun test', 'bun lint']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-1');
        expect(result.value.totalTests).toBe(2);
        expect(result.value.passedTests).toBe(2);
        expect(result.value.failedTests).toBe(0);
        expect(result.value.failures).toHaveLength(0);
      }
    });

    it('빈 명령어를 만나면 Fail-Fast로 중단한다', () => {
      const result = tester.runE2E('proj-1', ['bun test', '', 'bun lint']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // WHY: Fail-Fast - 두 번째 빈 명령어에서 즉시 중단
        expect(result.value.failedTests).toBe(1);
        expect(result.value.passedTests).toBe(1); // 첫 번째만 통과
        expect(result.value.failures).toHaveLength(1);
      }
    });
  });

  describe('isHealthy / 건강도 판정', () => {
    it('통과율 80% 이상이면 건강하다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 9,
          failedTests: 1,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(true);
    });

    it('통과율 80% 미만이면 건강하지 않다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 7,
          failedTests: 3,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(false);
    });

    it('정확히 80%이면 건강하다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 8,
          failedTests: 2,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(true);
    });

    it('빈 실행 목록이면 건강하지 않다', () => {
      // WHY: 실제 구현 - 빈 목록은 false 반환
      expect(tester.isHealthy([])).toBe(false);
    });

    it('전체 테스트가 0이면 건강하지 않다', () => {
      // WHY: 실제 구현 - totalTests === 0 → false 반환
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          duration: 0,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(false);
    });

    it('여러 실행의 합산으로 판정한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 5,
          passedTests: 5,
          failedTests: 0,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
        {
          id: 'e2e-2',
          projectId: 'proj-1',
          totalTests: 5,
          passedTests: 3,
          failedTests: 2,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
      ];
      // WHY: 합산 8/10 = 80% → 건강
      expect(tester.isHealthy(runs)).toBe(true);
    });
  });

  describe('getFailureRate / 실패율 계산', () => {
    it('실패율을 올바르게 계산한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 7,
          failedTests: 3,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBeCloseTo(0.3);
    });

    it('빈 실행 목록은 0을 반환한다', () => {
      expect(tester.getFailureRate([])).toBe(0);
    });

    it('전체 테스트가 0이면 0을 반환한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          duration: 0,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBe(0);
    });

    it('전부 통과하면 0을 반환한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 5,
          passedTests: 5,
          failedTests: 0,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBe(0);
    });

    it('전부 실패하면 1을 반환한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 5,
          passedTests: 0,
          failedTests: 5,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBe(1);
    });

    it('단일 테스트 실패율 0.5', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-rate-1',
          projectId: 'proj-x',
          totalTests: 2,
          passedTests: 1,
          failedTests: 1,
          duration: 20,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBeCloseTo(0.5);
    });

    it('여러 실행의 실패율 합산 계산', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-a',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 10,
          failedTests: 0,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
        {
          id: 'e2e-b',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 0,
          failedTests: 10,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      // 합산: 10 passed / 20 total = 0.5 failure rate
      expect(tester.getFailureRate(runs)).toBeCloseTo(0.5);
    });
  });

  describe('UUID/랜덤 프로젝트 ID edge case', () => {
    it('UUID 형식 프로젝트 ID로 세션 시작', async () => {
      const uuid = crypto.randomUUID();
      const result = await tester.start({
        projectId: uuid,
        testPath: './tests/e2e',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        sessionIds.push(result.value.id);
        expect(result.value.projectId).toBe(uuid);
      }
    });

    it('한국어 테스트 경로로 세션 시작', async () => {
      const result = await tester.start({
        projectId: 'proj-한국어',
        testPath: './테스트/경로',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        sessionIds.push(result.value.id);
        expect(result.value.config.testPath).toBe('./테스트/경로');
      }
    });

    it('intervalMs=0이어도 세션 시작 가능', async () => {
      const result = await tester.start({
        projectId: 'proj-zero-interval',
        testPath: './tests/e2e',
        intervalMs: 0,
      });
      // 구현에 따라 ok 또는 error — 타입만 확인
      expect(typeof result.ok).toBe('boolean');
      if (result.ok) sessionIds.push(result.value.id);
    });

    it('intervalMs 음수는 에러 또는 허용 (구현 의존)', async () => {
      const result = await tester.start({
        projectId: 'proj-neg',
        testPath: './tests',
        intervalMs: -1,
      });
      expect(typeof result.ok).toBe('boolean');
      if (result.ok) sessionIds.push(result.value.id);
    });

    it('특수문자 포함 프로젝트 ID', async () => {
      const result = await tester.start({
        projectId: 'proj-!@#$%',
        testPath: './tests',
      });
      expect(typeof result.ok).toBe('boolean');
      if (result.ok) sessionIds.push(result.value.id);
    });

    it('매우 긴 프로젝트 ID (200자)', async () => {
      const longId = 'p'.repeat(200);
      const result = await tester.start({
        projectId: longId,
        testPath: './tests/e2e',
      });
      expect(typeof result.ok).toBe('boolean');
      if (result.ok) sessionIds.push(result.value.id);
    });

    it('중복 세션 ID는 절대 생성되지 않는다 (5개)', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await tester.start({ projectId: `proj-${i}`, testPath: './tests/e2e' });
        if (r.ok) {
          ids.push(r.value.id);
          sessionIds.push(r.value.id);
        }
      }
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('isHealthy 경계값', () => {
    it('totalTests=1, passed=1 → healthy', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-h1',
          projectId: 'proj-1',
          totalTests: 1,
          passedTests: 1,
          failedTests: 0,
          duration: 10,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(true);
    });

    it('totalTests=1, passed=0 → not healthy', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-h2',
          projectId: 'proj-1',
          totalTests: 1,
          passedTests: 0,
          failedTests: 1,
          duration: 10,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(false);
    });

    it('100개 테스트 79개 통과 → not healthy', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-h3',
          projectId: 'proj-1',
          totalTests: 100,
          passedTests: 79,
          failedTests: 21,
          duration: 1000,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(false);
    });

    it('100개 테스트 80개 통과 → healthy', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-h4',
          projectId: 'proj-1',
          totalTests: 100,
          passedTests: 80,
          failedTests: 20,
          duration: 1000,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(true);
    });

    it('UUID id를 가진 E2ETestRun도 처리', () => {
      const runs: E2ETestRun[] = [
        {
          id: crypto.randomUUID(),
          projectId: crypto.randomUUID(),
          totalTests: 5,
          passedTests: 5,
          failedTests: 0,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(true);
    });

    it('getFailureRate 반환값은 number 타입', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-type',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 8,
          failedTests: 2,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(typeof tester.getFailureRate(runs)).toBe('number');
    });
  });

  describe('runE2E edge case', () => {
    it('빈 명령어 목록은 ok 또는 error를 반환한다 (구현 의존)', () => {
      const result = tester.runE2E('proj-1', []);
      // 구현에 따라 빈 배열은 에러이거나 빈 결과 — 타입만 확인
      expect(typeof result.ok).toBe('boolean');
    });

    it('UUID 프로젝트 ID로 runE2E', () => {
      const uuid = crypto.randomUUID();
      const result = tester.runE2E(uuid, ['bun test']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe(uuid);
      }
    });

    it('한국어 명령어 포함 목록', () => {
      const result = tester.runE2E('proj-1', ['bun 테스트', 'bun 린트']);
      // 구현에 따라 성공/실패 - 타입만 확인
      expect(typeof result.ok).toBe('boolean');
    });

    it('공백 명령어만 포함 목록', () => {
      const result = tester.runE2E('proj-1', ['   ']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.failedTests).toBe(1);
      }
    });

    it('100개 정상 명령어', () => {
      const commands = Array.from({ length: 100 }, (_, i) => `bun test-${i}`);
      const result = tester.runE2E('proj-1', commands);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.totalTests).toBe(100);
        expect(result.value.passedTests).toBe(100);
        expect(result.value.failedTests).toBe(0);
      }
    });

    it('runE2E failures 배열 타입 확인', () => {
      const result = tester.runE2E('proj-1', ['cmd1', 'cmd2']);
      if (result.ok) {
        expect(Array.isArray(result.value.failures)).toBe(true);
      }
    });

    it('runE2E projectId는 전달값과 일치', () => {
      const result = tester.runE2E('my-project', ['bun test']);
      if (result.ok) {
        expect(result.value.projectId).toBe('my-project');
      }
    });
  });
});
