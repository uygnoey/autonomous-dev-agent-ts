/**
 * layer1 ↔ rag 모듈 통합 테스트 / layer1 ↔ rag module integration tests
 *
 * @description
 * KR: ConversationManager가 MemoryRepository를 통해 대화 저장/조회하고,
 *     ContractBuilder로 HandoffPackage를 생성하여 검증한다.
 * EN: Verifies ConversationManager stores/retrieves conversations via MemoryRepository,
 *     and ContractBuilder generates verified HandoffPackages.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConsoleLogger, MemoryRepository } from '../../src/core/index.js';
import type { Logger } from '../../src/core/logger.js';
import { ContractBuilder, ConversationManager } from '../../src/layer1/index.js';
import type {
  ConversationMessage,
  FeatureSpec,
  TestTypeDefinition,
} from '../../src/layer1/types.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');
let tmpDir: string;

/** 테스트용 대화 메시지 생성 / Create test conversation message */
function createMessage(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  projectId = 'proj-1',
): ConversationMessage {
  return { id, role, content, timestamp: new Date(), projectId };
}

/** 테스트용 FeatureSpec 생성 / Create test FeatureSpec */
function createFeature(id: string, deps: string[] = []): FeatureSpec {
  return {
    id,
    name: `Feature ${id}`,
    description: `Description for ${id}`,
    acceptanceCriteria: [
      { id: `ac-${id}-1`, description: 'Criterion 1', verifiable: true, testCategory: 'unit' },
    ],
    dependencies: deps,
    inputs: [{ name: 'input', type: 'string', constraints: '', required: true }],
    outputs: [{ name: 'output', type: 'string', constraints: '', required: true }],
  };
}

/** 테스트용 TestTypeDefinition 생성 / Create test TestTypeDefinition */
function createTestDef(featureId: string): TestTypeDefinition {
  return {
    featureId,
    categories: [
      { name: 'unit', description: 'Unit tests', mappedCriteria: [`ac-${featureId}-1`] },
    ],
    rules: ['test first'],
    sampleTests: [
      { category: 'unit', description: 'sample', expectedBehavior: 'should pass' },
    ],
    ratios: { unit: 0.7, module: 0.2, e2e: 0.1 },
  };
}

// ── 테스트 ────────────────────────────────────────────────────────

describe('layer1 ↔ rag 통합 / layer1 ↔ rag integration', () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'adev-layer1-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('ConversationManager가 MemoryRepository를 통해 대화 저장', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'conv-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const msg = createMessage('msg-1', 'user', 'Hello, I want to build a CLI');

    const addResult = await manager.addMessage(msg);
    expect(addResult.ok).toBe(true);
  });

  it('ConversationManager가 프로젝트별 대화 이력 조회', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'history-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);

    await manager.addMessage(createMessage('msg-1', 'user', 'Request from proj-1', 'proj-1'));
    await manager.addMessage(createMessage('msg-2', 'assistant', 'Response for proj-1', 'proj-1'));
    await manager.addMessage(createMessage('msg-3', 'user', 'Request from proj-2', 'proj-2'));

    const historyResult = await manager.getHistory('proj-1');
    expect(historyResult.ok).toBe(true);
    if (!historyResult.ok) return;

    // WHY: proj-1에 속한 메시지만 반환
    expect(historyResult.value.every((m) => m.projectId === 'proj-1')).toBe(true);
    expect(historyResult.value.length).toBe(2);
  });

  it('ConversationManager searchContext로 키워드 기반 검색', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'search-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);

    await manager.addMessage(createMessage('msg-1', 'user', 'I need authentication feature', 'proj-1'));
    await manager.addMessage(createMessage('msg-2', 'user', 'Also need a database layer', 'proj-1'));
    await manager.addMessage(createMessage('msg-3', 'assistant', 'authentication will use JWT', 'proj-1'));

    const searchResult = await manager.searchContext('proj-1', 'authentication');
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;

    // WHY: 'authentication' 키워드가 포함된 메시지만 반환
    expect(searchResult.value.length).toBeGreaterThanOrEqual(1);
    expect(
      searchResult.value.every((m) => m.content.toLowerCase().includes('authentication')),
    ).toBe(true);
  });

  it('ContractBuilder가 유효한 Contract 생성', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1'), createFeature('feat-2', ['feat-1'])];
    const testDefs = [createTestDef('feat-1'), createTestDef('feat-2')];

    const result = builder.buildContract(features, testDefs, 'CLI application design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.features.length).toBe(2);
    expect(result.value.implementationOrder[0]).toBe('feat-1');
    expect(result.value.implementationOrder[1]).toBe('feat-2');
    expect(result.value.projectType).toBe('cli');
  });

  it('ContractBuilder가 순환 의존성 탐지', () => {
    const builder = new ContractBuilder(logger);

    // WHY: feat-1 → feat-2 → feat-1 순환
    const features = [createFeature('feat-1', ['feat-2']), createFeature('feat-2', ['feat-1'])];
    const testDefs = [createTestDef('feat-1'), createTestDef('feat-2')];

    const result = builder.buildContract(features, testDefs, 'design');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('contract_cyclic_dependency');
  });

  it('ContractBuilder가 빈 features에 에러', () => {
    const builder = new ContractBuilder(logger);

    const result = builder.buildContract([], [], 'design');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('contract_no_features');
  });

  it('ContractBuilder → HandoffPackage 생성 → 검증 통과', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1')];
    const testDefs = [createTestDef('feat-1')];

    const contractResult = builder.buildContract(features, testDefs, 'REST API endpoint design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoffResult = builder.buildHandoffPackage(
      'proj-1',
      contractResult.value,
      'Plan document',
      'REST API endpoint design',
      'Spec document',
    );
    expect(handoffResult.ok).toBe(true);
    if (!handoffResult.ok) return;

    expect(handoffResult.value.projectId).toBe('proj-1');
    expect(handoffResult.value.contract).toBeDefined();
    expect(handoffResult.value.id).toContain('handoff-proj-1');
    expect(handoffResult.value.confirmedByUser).toBe(false);
  });

  it('ContractBuilder validateContract가 5대 원칙 검증', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1')];
    const testDefs = [createTestDef('feat-1')];

    const contractResult = builder.buildContract(features, testDefs, 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const validationResult = builder.validateContract(contractResult.value);
    expect(validationResult.ok).toBe(true);
    if (!validationResult.ok) return;

    // WHY: 완전한 Contract이면 에러 없음
    expect(validationResult.value.length).toBe(0);
  });

  it('ContractBuilder validateContract가 수락 기준 없는 기능 탐지', () => {
    const builder = new ContractBuilder(logger);

    const featureNoAC: FeatureSpec = {
      id: 'feat-no-ac',
      name: 'No Acceptance Criteria',
      description: 'Feature without AC',
      acceptanceCriteria: [],
      dependencies: [],
      inputs: [{ name: 'in', type: 'string', constraints: '', required: true }],
      outputs: [{ name: 'out', type: 'string', constraints: '', required: true }],
    };

    const contractResult = builder.buildContract([featureNoAC], [], 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const validationResult = builder.validateContract(contractResult.value);
    expect(validationResult.ok).toBe(true);
    if (!validationResult.ok) return;

    expect(validationResult.value.length).toBeGreaterThan(0);
    expect(validationResult.value.some((e) => e.includes('수락 기준') || e.includes('criteria'))).toBe(true);
  });

  it('VerificationMatrix completenessScore가 올바르게 산출', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1')];
    const testDefs = [createTestDef('feat-1')];

    const contractResult = builder.buildContract(features, testDefs, 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const matrix = contractResult.value.verificationMatrix;
    expect(matrix.allFeaturesHaveCriteria).toBe(true);
    expect(matrix.allCriteriaHaveTests).toBe(true);
    expect(matrix.noCyclicDependencies).toBe(true);
    expect(matrix.allIODefined).toBe(true);
    expect(matrix.completenessScore).toBe(1.0);
  });

  it('ConversationMessage role 파싱이 저장/조회 후에도 유지', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'role-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);

    await manager.addMessage(createMessage('msg-user', 'user', 'User question'));
    await manager.addMessage(createMessage('msg-asst', 'assistant', 'Assistant answer'));

    const history = await manager.getHistory('proj-1');
    expect(history.ok).toBe(true);
    if (!history.ok) return;

    const userMsg = history.value.find((m) => m.id === 'msg-user');
    const asstMsg = history.value.find((m) => m.id === 'msg-asst');

    expect(userMsg?.role).toBe('user');
    expect(asstMsg?.role).toBe('assistant');
  });

  it('ContractBuilder detectProjectType이 설계 문서에서 올바르게 탐지', () => {
    const builder = new ContractBuilder(logger);

    const restResult = builder.buildContract([createFeature('f1')], [createTestDef('f1')], 'REST API endpoint design');
    expect(restResult.ok).toBe(true);
    if (!restResult.ok) return;
    expect(restResult.value.projectType).toBe('rest-api');

    const cliResult = builder.buildContract([createFeature('f2')], [createTestDef('f2')], 'command line tool');
    expect(cliResult.ok).toBe(true);
    if (!cliResult.ok) return;
    expect(cliResult.value.projectType).toBe('cli');

    const genericResult = builder.buildContract([createFeature('f3')], [createTestDef('f3')], 'some project');
    expect(genericResult.ok).toBe(true);
    if (!genericResult.ok) return;
    expect(genericResult.value.projectType).toBe('generic');
  });
});
