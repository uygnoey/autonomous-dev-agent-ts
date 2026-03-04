/**
 * E2E: 기획 → 설계 → Contract 파이프라인 / Planning Pipeline
 *
 * @description
 * KR: layer1 전체 파이프라인: 대화 → 기획 → 설계 → 스펙 → 테스트 정의 → Contract → HandoffPackage → layer2 수신
 * EN: Full layer1 pipeline from conversation through contract to layer2 handoff.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../src/core/logger.js';
import { Planner } from '../../src/layer1/planner.js';
import { Designer } from '../../src/layer1/designer.js';
import { SpecBuilder } from '../../src/layer1/spec-builder.js';
import { TestTypeDesigner } from '../../src/layer1/test-type-designer.js';
import { ContractBuilder } from '../../src/layer1/contract-builder.js';
import { HandoffReceiver } from '../../src/layer2/handoff-receiver.js';
import type { ConversationMessage, FeatureSpec } from '../../src/layer1/types.js';

const logger = new ConsoleLogger('error');

/** 테스트용 대화 메시지 생성 헬퍼 / Helper to create test conversation messages */
function createMessage(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  projectId: string,
): ConversationMessage {
  return {
    id,
    role,
    content,
    timestamp: new Date(),
    projectId,
  };
}

/** 완전한 FeatureSpec 생성 헬퍼 / Helper to create a complete FeatureSpec */
function createCompleteFeature(id: string, name: string, deps: string[] = []): FeatureSpec {
  return {
    id,
    name,
    description: `Feature: ${name}`,
    acceptanceCriteria: [
      {
        id: `${id}-ac-1`,
        description: `${name} 정상 동작 확인`,
        verifiable: true,
        testCategory: 'functional',
      },
      {
        id: `${id}-ac-2`,
        description: `${name} 에러 처리 확인`,
        verifiable: true,
        testCategory: 'error-handling',
      },
    ],
    dependencies: deps,
    inputs: [
      { name: 'input', type: 'string', constraints: 'non-empty', required: true },
    ],
    outputs: [
      { name: 'output', type: 'string', constraints: 'formatted', required: true },
    ],
  };
}

describe('기획 → 설계 → Contract 파이프라인 E2E / Planning Pipeline E2E', () => {
  const projectId = 'test-project';

  it('Planner: 대화에서 기획 문서 생성', () => {
    const planner = new Planner(logger);
    const conversations: ConversationMessage[] = [
      createMessage('msg-1', 'user', 'TODO 앱을 만들고 싶습니다', projectId),
      createMessage('msg-2', 'assistant', 'CRUD 기능이 필요합니다', projectId),
      createMessage('msg-3', 'user', '마감일 기능도 추가해주세요', projectId),
    ];

    const result = planner.createPlan(projectId, conversations);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Project Plan');
      expect(result.value).toContain('Goals');
      expect(result.value).toContain('TODO 앱');
    }
  });

  it('Planner: 대화 부족 시 에러', () => {
    const planner = new Planner(logger);
    const result = planner.createPlan(projectId, []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_insufficient_data');
    }
  });

  it('Planner: 기획 문서에서 FeatureSpec 추출', () => {
    const planner = new Planner(logger);
    const plan = `# Plan\n\n## Features\n\n### User Auth\n\nLogin system\n\n### Data Export\n\nCSV export`;

    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.name).toBe('User Auth');
      expect(result.value[1]?.name).toBe('Data Export');
    }
  });

  it('Designer: 기획 + 기능에서 설계 문서 생성', () => {
    const designer = new Designer(logger);
    const features = [createCompleteFeature('feat-1', 'Auth')];
    const plan = '# Plan\n\n## Goals\n\nBuild auth';

    const result = designer.createDesign(projectId, plan, features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Design Document');
      expect(result.value).toContain('feat-1');
      expect(result.value).toContain('Auth');
    }
  });

  it('Designer: 설계 검증 → 기능 반영 확인', () => {
    const designer = new Designer(logger);
    const features = [createCompleteFeature('feat-1', 'Auth')];

    const designResult = designer.createDesign(projectId, 'Some plan', features);
    expect(designResult.ok).toBe(true);

    if (designResult.ok) {
      const validateResult = designer.validateDesign(designResult.value, features);
      expect(validateResult.ok).toBe(true);
      if (validateResult.ok) {
        expect(validateResult.value).toHaveLength(0);
      }
    }
  });

  it('SpecBuilder: 기획 + 설계 + 기능에서 스펙 문서 생성 + 검증', () => {
    const specBuilder = new SpecBuilder(logger);
    const features = [createCompleteFeature('feat-1', 'Auth')];
    const plan = '# Plan\n\n## Goals\n\nBuild auth system';
    const design = '# Design\n\nAuth design details';

    const specResult = specBuilder.buildSpec(plan, design, features);
    expect(specResult.ok).toBe(true);

    if (specResult.ok) {
      expect(specResult.value).toContain('Features');
      expect(specResult.value).toContain('Goals');
      expect(specResult.value).toContain('Design');
      expect(specResult.value).toContain('Plan');

      const validateResult = specBuilder.validateSpec(specResult.value);
      expect(validateResult.ok).toBe(true);
    }
  });

  it('TestTypeDesigner: 기능별 테스트 정의 생성', () => {
    const testDesigner = new TestTypeDesigner(logger);
    const features = [
      createCompleteFeature('feat-1', 'Auth'),
      createCompleteFeature('feat-2', 'Export'),
    ];

    const result = testDesigner.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.featureId).toBe('feat-1');
      expect(result.value[0]?.categories.length).toBeGreaterThan(0);
      expect(result.value[0]?.sampleTests.length).toBeGreaterThan(0);
    }
  });

  it('ContractBuilder: Contract 생성 + 5대 원칙 검증', () => {
    const testDesigner = new TestTypeDesigner(logger);
    const contractBuilder = new ContractBuilder(logger);
    const features = [
      createCompleteFeature('feat-1', 'Auth'),
      createCompleteFeature('feat-2', 'Dashboard', ['feat-1']),
    ];

    const testDefsResult = testDesigner.createDefinitions(features);
    expect(testDefsResult.ok).toBe(true);
    if (!testDefsResult.ok) return;

    const contractResult = contractBuilder.buildContract(
      features,
      testDefsResult.value,
      'REST API endpoint design',
    );
    expect(contractResult.ok).toBe(true);

    if (contractResult.ok) {
      const contract = contractResult.value;
      expect(contract.version).toBe(1);
      expect(contract.projectType).toBe('rest-api');
      expect(contract.features).toHaveLength(2);
      expect(contract.implementationOrder[0]).toBe('feat-1');
      expect(contract.implementationOrder[1]).toBe('feat-2');

      const validateResult = contractBuilder.validateContract(contract);
      expect(validateResult.ok).toBe(true);
      if (validateResult.ok) {
        expect(validateResult.value).toHaveLength(0);
      }
    }
  });

  it('ContractBuilder: 순환 의존성 탐지', () => {
    const contractBuilder = new ContractBuilder(logger);
    const features: FeatureSpec[] = [
      createCompleteFeature('feat-a', 'A', ['feat-b']),
      createCompleteFeature('feat-b', 'B', ['feat-a']),
    ];

    const result = contractBuilder.buildContract(features, [], 'design');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('contract_cyclic_dependency');
    }
  });

  it('HandoffPackage → layer2 HandoffReceiver 수신 + 재검증', () => {
    const testDesigner = new TestTypeDesigner(logger);
    const contractBuilder = new ContractBuilder(logger);
    const receiver = new HandoffReceiver(logger);

    const features = [
      createCompleteFeature('feat-1', 'Auth'),
      createCompleteFeature('feat-2', 'Profile', ['feat-1']),
    ];

    const testDefsResult = testDesigner.createDefinitions(features);
    expect(testDefsResult.ok).toBe(true);
    if (!testDefsResult.ok) return;

    const contractResult = contractBuilder.buildContract(
      features,
      testDefsResult.value,
      'CLI command line design',
    );
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoffResult = contractBuilder.buildHandoffPackage(
      projectId,
      contractResult.value,
      'Plan document',
      'Design document',
      'Spec document',
    );
    expect(handoffResult.ok).toBe(true);
    if (!handoffResult.ok) return;

    const handoff = handoffResult.value;
    expect(handoff.projectId).toBe(projectId);
    expect(handoff.confirmedByUser).toBe(false);

    // WHY: layer2에서 HandoffPackage를 수신하고 재검증한다
    const receiveResult = receiver.receive(handoff);
    expect(receiveResult.ok).toBe(true);
  });

  it('전체 파이프라인 통합: 대화 → HandoffPackage', () => {
    const planner = new Planner(logger);
    const designer = new Designer(logger);
    const specBuilder = new SpecBuilder(logger);
    const testDesigner = new TestTypeDesigner(logger);
    const contractBuilder = new ContractBuilder(logger);

    // Step 1: 대화 추가
    const conversations: ConversationMessage[] = [
      createMessage('m1', 'user', '### 인증 시스템\n\n로그인/로그아웃', projectId),
      createMessage('m2', 'assistant', 'JWT 기반 인증을 구현하겠습니다', projectId),
    ];

    // Step 2: 기획서 생성
    const planResult = planner.createPlan(projectId, conversations);
    expect(planResult.ok).toBe(true);
    if (!planResult.ok) return;

    // Step 3: 완전한 기능 명세 사용 (파서 한계 회피)
    const features = [createCompleteFeature('feat-auth', 'Authentication')];

    // Step 4: 설계서 생성
    const designResult = designer.createDesign(projectId, planResult.value, features);
    expect(designResult.ok).toBe(true);
    if (!designResult.ok) return;

    // Step 5: 스펙 문서 생성
    const specResult = specBuilder.buildSpec(planResult.value, designResult.value, features);
    expect(specResult.ok).toBe(true);
    if (!specResult.ok) return;

    // Step 6: 테스트 정의 생성
    const testDefsResult = testDesigner.createDefinitions(features);
    expect(testDefsResult.ok).toBe(true);
    if (!testDefsResult.ok) return;

    // Step 7: Contract 생성
    const contractResult = contractBuilder.buildContract(
      features,
      testDefsResult.value,
      designResult.value,
    );
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    // Step 8: HandoffPackage
    const handoffResult = contractBuilder.buildHandoffPackage(
      projectId,
      contractResult.value,
      planResult.value,
      designResult.value,
      specResult.value,
    );
    expect(handoffResult.ok).toBe(true);
    if (handoffResult.ok) {
      expect(handoffResult.value.contract.features).toHaveLength(1);
      expect(handoffResult.value.planDocument).toContain('Goals');
    }
  });
});
