/**
 * HandoffReceiver 단위 테스트 / HandoffReceiver unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { HandoffReceiver } from '../../../src/layer2/handoff-receiver.js';
import type { ContractSchema, HandoffPackage } from '../../../src/layer1/types.js';

/**
 * 유효한 Contract를 생성한다 / Creates a valid contract
 */
function createValidContract(): ContractSchema {
  return {
    version: 1,
    projectType: 'web-app',
    features: [
      {
        id: 'feat-1',
        name: '사용자 인증',
        description: '사용자 로그인/로그아웃',
        acceptanceCriteria: [
          { id: 'ac-1', description: '로그인 성공', verifiable: true, testCategory: 'auth' },
        ],
        dependencies: [],
        inputs: [{ name: 'email', type: 'string', constraints: '이메일 형식', required: true }],
        outputs: [{ name: 'token', type: 'string', constraints: 'JWT 토큰', required: true }],
      },
    ],
    testDefinitions: [
      {
        featureId: 'feat-1',
        categories: [{ name: 'auth', description: '인증 테스트', mappedCriteria: ['ac-1'] }],
        rules: ['단위 테스트 필수'],
        sampleTests: [
          {
            category: 'auth',
            description: '로그인 성공 테스트',
            expectedBehavior: 'JWT 토큰 반환',
          },
        ],
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
  };
}

/**
 * 유효한 HandoffPackage를 생성한다 / Creates a valid handoff package
 */
function createValidHandoff(contract?: ContractSchema): HandoffPackage {
  return {
    id: 'handoff-1',
    projectId: 'proj-1',
    contract: contract ?? createValidContract(),
    planDocument: '기획 문서',
    designDocument: '설계 문서',
    specDocument: '스펙 문서',
    createdAt: new Date(),
    confirmedByUser: true,
  };
}

describe('HandoffReceiver', () => {
  let receiver: HandoffReceiver;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    receiver = new HandoffReceiver(logger);
  });

  describe('receive / 패키지 수신', () => {
    it('유효한 패키지를 수신한다', () => {
      const result = receiver.receive(createValidHandoff());
      expect(result.ok).toBe(true);
    });

    it('수락 기준 없는 기능이 있으면 에러를 반환한다', () => {
      const contract = createValidContract();
      const badContract: ContractSchema = {
        ...contract,
        features: [
          {
            ...contract.features[0]!,
            acceptanceCriteria: [],
          },
        ],
      };
      const result = receiver.receive(createValidHandoff(badContract));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('contract_structure_invalid');
      }
    });

    it('테스트 정의 없는 기능이 있으면 에러를 반환한다', () => {
      const contract = createValidContract();
      const badContract: ContractSchema = {
        ...contract,
        testDefinitions: [],
      };
      const result = receiver.receive(createValidHandoff(badContract));
      expect(result.ok).toBe(false);
    });

    it('완전성 점수가 낮으면 에러를 반환한다', () => {
      const contract = createValidContract();
      const badContract: ContractSchema = {
        ...contract,
        verificationMatrix: {
          ...contract.verificationMatrix,
          completenessScore: 0.3,
        },
      };
      const result = receiver.receive(createValidHandoff(badContract));
      expect(result.ok).toBe(false);
    });
  });

  describe('validateStructure / 구조 검증', () => {
    it('유효한 Contract는 빈 에러 배열을 반환한다', () => {
      const result = receiver.validateStructure(createValidContract());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('입출력 없는 기능을 감지한다', () => {
      const contract = createValidContract();
      const badContract: ContractSchema = {
        ...contract,
        features: [
          {
            ...contract.features[0]!,
            inputs: [],
            outputs: [],
          },
        ],
      };
      const result = receiver.validateStructure(badContract);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('순환 의존성 감지 / Cyclic dependency detection', () => {
    it('순환 의존성을 감지한다', () => {
      const contract: ContractSchema = {
        ...createValidContract(),
        features: [
          {
            id: 'feat-1',
            name: 'A',
            description: 'A',
            acceptanceCriteria: [
              { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'test' },
            ],
            dependencies: ['feat-2'],
            inputs: [{ name: 'input', type: 'string', constraints: '', required: true }],
            outputs: [{ name: 'output', type: 'string', constraints: '', required: true }],
          },
          {
            id: 'feat-2',
            name: 'B',
            description: 'B',
            acceptanceCriteria: [
              { id: 'ac-2', description: '기준', verifiable: true, testCategory: 'test' },
            ],
            dependencies: ['feat-1'],
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
            ratios: { unit: 1, module: 0, e2e: 0 },
          },
          {
            featureId: 'feat-2',
            categories: [],
            rules: [],
            sampleTests: [],
            ratios: { unit: 1, module: 0, e2e: 0 },
          },
        ],
        implementationOrder: ['feat-1', 'feat-2'],
        verificationMatrix: {
          allFeaturesHaveCriteria: true,
          allCriteriaHaveTests: true,
          noCyclicDependencies: false,
          allIODefined: true,
          completenessScore: 0.9,
        },
      };

      const result = receiver.validateStructure(contract);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasCyclicError = result.value.some((e) => e.includes('순환'));
        expect(hasCyclicError).toBe(true);
      }
    });
  });

  describe('validateConsistency / 일관성 검증', () => {
    it('구현 순서에 없는 기능을 감지한다', () => {
      const contract: ContractSchema = {
        ...createValidContract(),
        implementationOrder: [],
      };
      const result = receiver.validateConsistency(contract);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });
  });
});
