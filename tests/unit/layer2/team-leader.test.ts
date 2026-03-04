/**
 * TeamLeader 단위 테스트 / TeamLeader unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import type { AuthProvider, RateLimitStatus } from '../../../src/auth/types.js';
import type { Result } from '../../../src/core/types.js';
import { ok } from '../../../src/core/types.js';
import type { HandoffPackage } from '../../../src/layer1/types.js';
import { AgentGenerator } from '../../../src/layer2/agent-generator.js';
import { AgentSpawner } from '../../../src/layer2/agent-spawner.js';
import { BiasDetector } from '../../../src/layer2/bias-detector.js';
import { CoderAllocator } from '../../../src/layer2/coder-allocator.js';
import { FailureHandler } from '../../../src/layer2/failure-handler.js';
import { IntegrationTester } from '../../../src/layer2/integration-tester.js';
import { PhaseEngine } from '../../../src/layer2/phase-engine.js';
import { ProgressTracker } from '../../../src/layer2/progress-tracker.js';
import { SessionManager } from '../../../src/layer2/session-manager.js';
import { StreamMonitor } from '../../../src/layer2/stream-monitor.js';
import { TeamLeader } from '../../../src/layer2/team-leader.js';
import { TokenMonitor } from '../../../src/layer2/token-monitor.js';
import type { AgentConfig, AgentEvent, AgentExecutor } from '../../../src/layer2/types.js';
import { VerificationGate } from '../../../src/layer2/verification-gate.js';

/**
 * Mock AgentExecutor
 */
function createMockExecutor(): AgentExecutor {
  return {
    async *execute(config: AgentConfig): AsyncIterable<AgentEvent> {
      yield {
        type: 'message',
        agentName: config.name,
        content: `${config.name} 실행 완료`,
        timestamp: new Date(),
      };
      yield {
        type: 'done',
        agentName: config.name,
        content: '완료',
        timestamp: new Date(),
      };
    },
    async *resume(_sessionId: string): AsyncIterable<AgentEvent> {
      yield {
        type: 'done',
        agentName: 'architect',
        content: '세션 재개 완료',
        timestamp: new Date(),
      };
    },
  };
}

/**
 * Mock AuthProvider
 */
function createMockAuthProvider(): AuthProvider {
  return {
    authMode: 'api-key',
    getAuthHeader: () => ({ Authorization: 'Bearer test' }),
    getRateLimitStatus: (): RateLimitStatus => ({
      requestsRemaining: 80,
      inputTokensRemaining: null,
      outputTokensRemaining: null,
      retryAfterSeconds: null,
      isLimitApproaching: false,
    }),
    updateFromResponse: (): Result<void> => ok(undefined),
  };
}

/**
 * Mock HandoffPackage
 */
function createMockHandoff(): HandoffPackage {
  return {
    id: 'handoff-1',
    projectId: 'proj-1',
    contract: {
      version: 1,
      projectType: 'web-app',
      features: [
        {
          id: 'feat-1',
          name: '테스트 기능',
          description: '테스트용 기능',
          acceptanceCriteria: [
            { id: 'ac-1', description: '기준 1', verifiable: true, testCategory: 'test' },
          ],
          dependencies: [],
          inputs: [{ name: 'input', type: 'string', constraints: '', required: true }],
          outputs: [{ name: 'output', type: 'string', constraints: '', required: true }],
        },
      ],
      testDefinitions: [
        {
          featureId: 'feat-1',
          categories: [],
          rules: [],
          sampleTests: [],
          ratios: { unit: 0.6, module: 0.3, e2e: 0.1 },
        },
      ],
      implementationOrder: ['feat-1'],
      verificationMatrix: {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 1.0,
      },
    },
    planDocument: '기획',
    designDocument: '설계',
    specDocument: '스펙',
    createdAt: new Date(),
    confirmedByUser: true,
  };
}

describe('TeamLeader', () => {
  let leader: TeamLeader;
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger('error');
    const executor = createMockExecutor();
    const authProvider = createMockAuthProvider();

    leader = new TeamLeader({
      phaseEngine: new PhaseEngine(logger),
      agentSpawner: new AgentSpawner(executor, logger),
      sessionManager: new SessionManager(logger),
      tokenMonitor: new TokenMonitor(authProvider, logger),
      progressTracker: new ProgressTracker(logger),
      agentGenerator: new AgentGenerator(logger),
      coderAllocator: new CoderAllocator(logger),
      streamMonitor: new StreamMonitor(logger),
      biasDetector: new BiasDetector(logger),
      failureHandler: new FailureHandler(logger),
      verificationGate: new VerificationGate(logger),
      integrationTester: new IntegrationTester(logger),
      logger,
    });
  });

  describe('getStatus / 상태 조회', () => {
    it('초기 상태를 반환한다', () => {
      const status = leader.getStatus();
      expect(status.featureId).toBeNull();
      expect(status.phase).toBe('DESIGN');
      expect(status.progress).toBe(0);
    });
  });

  describe('executeFeature / 기능 실행', () => {
    it('이벤트를 생성한다', async () => {
      const events: AgentEvent[] = [];
      const handoff = createMockHandoff();

      for await (const event of leader.executeFeature('feat-1', handoff)) {
        events.push(event);
        // WHY: 무한 루프 방지를 위해 일정 수 이벤트 후 중단
        if (events.length >= 50) break;
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it('실행 후 상태가 갱신된다', async () => {
      const handoff = createMockHandoff();
      let count = 0;

      for await (const _event of leader.executeFeature('feat-1', handoff)) {
        count += 1;
        if (count >= 50) break;
      }

      const status = leader.getStatus();
      expect(status.featureId).toBe('feat-1');
    });
  });
});
