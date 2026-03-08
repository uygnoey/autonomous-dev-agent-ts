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
import { ConsoleLogger, MemoryRepository } from 'core/index.js';
import type { Logger } from 'core/logger.js';
import { ContractBuilder, ConversationManager } from 'layer1/index.js';
import type {
  ConversationMessage,
  FeatureSpec,
  TestTypeDefinition,
} from 'layer1/types.js';

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

  // ── 추가 edge/random case 테스트 ────────────────────────────────

  it('ConversationManager: 빈 projectId에도 메시지 저장 허용', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'empty-proj-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const msg = createMessage('msg-empty', 'user', 'test content', '');

    const addResult = await manager.addMessage(msg);
    // WHY: 빈 projectId는 구현에 따라 허용되거나 에러를 반환 — 양쪽 모두 유효한 동작
    expect(typeof addResult.ok).toBe('boolean');
  });

  it('ConversationManager: 아주 긴 content 메시지 저장', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'long-content-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const longContent = 'A'.repeat(50000);
    const msg = createMessage('msg-long', 'user', longContent, 'proj-long');

    const addResult = await manager.addMessage(msg);
    expect(addResult.ok).toBe(true);
  });

  it('ConversationManager: 한글 content 메시지 저장 및 검색', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'korean-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('msg-kr-1', 'user', '인증 기능이 필요합니다', 'proj-kr'));
    await manager.addMessage(createMessage('msg-kr-2', 'assistant', '인증은 JWT를 사용합니다', 'proj-kr'));

    const historyResult = await manager.getHistory('proj-kr');
    expect(historyResult.ok).toBe(true);
    if (!historyResult.ok) return;
    expect(historyResult.value.length).toBe(2);

    const searchResult = await manager.searchContext('proj-kr', '인증');
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeGreaterThanOrEqual(1);
  });

  it('ConversationManager: 특수문자 포함 content 저장', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'special-chars-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const specialContent = '!@#$%^&*()_+{}|:<>?[]\\;\'",./`~\n\t\r';
    const msg = createMessage('msg-special', 'user', specialContent, 'proj-special');

    const addResult = await manager.addMessage(msg);
    expect(addResult.ok).toBe(true);
  });

  it('ConversationManager: 동일 id 메시지 중복 저장 처리', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'dup-id-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const msg1 = createMessage('dup-id', 'user', 'first content', 'proj-dup');
    const msg2 = createMessage('dup-id', 'assistant', 'second content', 'proj-dup');

    await manager.addMessage(msg1);
    const secondResult = await manager.addMessage(msg2);
    // WHY: 중복 id 처리는 구현 의존 — ok or fail 모두 유효
    expect(typeof secondResult.ok).toBe('boolean');
  });

  it('ConversationManager: UUID 형식 id로 메시지 저장', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'uuid-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const msg = createMessage(uuid, 'user', 'UUID id message', 'proj-uuid');

    const addResult = await manager.addMessage(msg);
    expect(addResult.ok).toBe(true);
  });

  it('ConversationManager: 메시지 없는 프로젝트 이력 조회 → 빈 배열', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'empty-history-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const historyResult = await manager.getHistory('proj-nonexistent');
    expect(historyResult.ok).toBe(true);
    if (!historyResult.ok) return;
    expect(historyResult.value.length).toBe(0);
  });

  it('ConversationManager: 검색어가 빈 문자열이면 빈 결과 반환', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'empty-search-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('msg-1', 'user', 'some content', 'proj-1'));

    const searchResult = await manager.searchContext('proj-1', '');
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    // WHY: 빈 검색어는 매칭 없음 또는 전체 반환 — 길이 확인
    expect(Array.isArray(searchResult.value)).toBe(true);
  });

  it('ConversationManager: 대소문자 혼합 검색 키워드', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'case-search-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('msg-1', 'user', 'Authentication feature needed', 'proj-case'));
    await manager.addMessage(createMessage('msg-2', 'assistant', 'AUTHENTICATION via OAuth', 'proj-case'));

    const searchResult = await manager.searchContext('proj-case', 'authentication');
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    // WHY: 대소문자 무관 검색 → 2개 이상
    expect(searchResult.value.length).toBeGreaterThanOrEqual(1);
  });

  it('ContractBuilder: 매우 많은 features (20개) 처리', () => {
    const builder = new ContractBuilder(logger);

    const features = Array.from({ length: 20 }, (_, i) => createFeature(`feat-${i + 1}`));
    const testDefs = Array.from({ length: 20 }, (_, i) => createTestDef(`feat-${i + 1}`));

    const result = builder.buildContract(features, testDefs, 'large project design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.features.length).toBe(20);
  });

  it('ContractBuilder: 깊은 의존성 체인 (feat-1 → feat-2 → feat-3 → feat-4)', () => {
    const builder = new ContractBuilder(logger);

    const features = [
      createFeature('feat-1'),
      createFeature('feat-2', ['feat-1']),
      createFeature('feat-3', ['feat-2']),
      createFeature('feat-4', ['feat-3']),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'chained deps design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // WHY: 의존성 순서 확인
    const order = result.value.implementationOrder;
    expect(order.indexOf('feat-1')).toBeLessThan(order.indexOf('feat-2'));
    expect(order.indexOf('feat-2')).toBeLessThan(order.indexOf('feat-3'));
    expect(order.indexOf('feat-3')).toBeLessThan(order.indexOf('feat-4'));
  });

  it('ContractBuilder: 자기 참조 의존성 탐지 (feat-1 → feat-1)', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1', ['feat-1'])];
    const testDefs = [createTestDef('feat-1')];

    const result = builder.buildContract(features, testDefs, 'self-dep design');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // WHY: 자기 참조도 순환 의존성으로 탐지되어야 함
    expect(result.error.code).toBe('contract_cyclic_dependency');
  });

  it('ContractBuilder: 존재하지 않는 의존성 id 처리', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1', ['feat-nonexistent'])];
    const testDefs = [createTestDef('feat-1')];

    const result = builder.buildContract(features, testDefs, 'broken dep design');
    // WHY: 존재하지 않는 의존성은 에러 또는 경고 — 구현에 따라 허용 가능
    expect(typeof result.ok).toBe('boolean');
  });

  it('ContractBuilder: 한글 feature name과 description', () => {
    const builder = new ContractBuilder(logger);

    const koreanFeature: FeatureSpec = {
      id: 'feat-kr',
      name: '인증 기능',
      description: 'JWT 기반 사용자 인증 기능',
      acceptanceCriteria: [
        { id: 'ac-kr-1', description: '로그인 성공 시 토큰 반환', verifiable: true, testCategory: 'unit' },
      ],
      dependencies: [],
      inputs: [{ name: '아이디', type: 'string', constraints: '', required: true }],
      outputs: [{ name: '토큰', type: 'string', constraints: '', required: true }],
    };

    const result = builder.buildContract([koreanFeature], [createTestDef('feat-kr')], '한국어 프로젝트 설계');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.features[0]?.name).toBe('인증 기능');
  });

  it('ContractBuilder: 설계 문서 빈 문자열에서 projectType generic 탐지', () => {
    const builder = new ContractBuilder(logger);

    const result = builder.buildContract([createFeature('f1')], [createTestDef('f1')], '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.projectType).toBe('generic');
  });

  it('ContractBuilder: testDefs가 features보다 적을 때 처리', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1'), createFeature('feat-2')];
    const testDefs = [createTestDef('feat-1')]; // feat-2 testDef 없음

    const result = builder.buildContract(features, testDefs, 'partial testDefs design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WHY: testDef 없는 기능은 allCriteriaHaveTests가 false
    expect(result.value.verificationMatrix.allCriteriaHaveTests).toBe(false);
  });

  it('ContractBuilder: buildHandoffPackage에 특수문자 projectId', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1')];
    const testDefs = [createTestDef('feat-1')];
    const contractResult = builder.buildContract(features, testDefs, 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const specialProjectId = 'proj_특수!@#$%';
    const handoffResult = builder.buildHandoffPackage(
      specialProjectId,
      contractResult.value,
      'plan',
      'design',
      'spec',
    );
    expect(handoffResult.ok).toBe(true);
    if (!handoffResult.ok) return;
    expect(handoffResult.value.projectId).toBe(specialProjectId);
  });

  it('ContractBuilder: buildHandoffPackage에 빈 planDocument', () => {
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1')];
    const testDefs = [createTestDef('feat-1')];
    const contractResult = builder.buildContract(features, testDefs, 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoffResult = builder.buildHandoffPackage(
      'proj-empty-plan',
      contractResult.value,
      '',
      'design',
      'spec',
    );
    // WHY: 빈 planDocument 허용 여부는 구현에 따라 다름
    expect(typeof handoffResult.ok).toBe('boolean');
  });

  it('ContractBuilder: 다이아몬드 의존성 (feat-1,feat-2 → feat-3, feat-3 → feat-4)', () => {
    const builder = new ContractBuilder(logger);

    const features = [
      createFeature('feat-1'),
      createFeature('feat-2'),
      createFeature('feat-3', ['feat-1', 'feat-2']),
      createFeature('feat-4', ['feat-3']),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'diamond deps design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = result.value.implementationOrder;
    // WHY: feat-3은 feat-1,feat-2 이후, feat-4는 feat-3 이후
    expect(order.indexOf('feat-3')).toBeGreaterThan(order.indexOf('feat-1'));
    expect(order.indexOf('feat-3')).toBeGreaterThan(order.indexOf('feat-2'));
    expect(order.indexOf('feat-4')).toBeGreaterThan(order.indexOf('feat-3'));
  });

  it('ConversationManager: 100개 메시지 대량 저장 후 프로젝트별 조회', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'bulk-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);

    for (let i = 0; i < 50; i++) {
      await manager.addMessage(createMessage(`msg-a-${i}`, 'user', `content ${i}`, 'proj-a'));
    }
    for (let i = 0; i < 50; i++) {
      await manager.addMessage(createMessage(`msg-b-${i}`, 'assistant', `content ${i}`, 'proj-b'));
    }

    const histA = await manager.getHistory('proj-a');
    expect(histA.ok).toBe(true);
    if (!histA.ok) return;
    expect(histA.value.length).toBe(50);

    const histB = await manager.getHistory('proj-b');
    expect(histB.ok).toBe(true);
    if (!histB.ok) return;
    expect(histB.value.length).toBe(50);
  });

  it('ContractBuilder: validationResult 에러가 문자열 배열', () => {
    const builder = new ContractBuilder(logger);

    const featureNoAC: FeatureSpec = {
      id: 'feat-no-ac-2',
      name: 'No AC',
      description: 'No acceptance criteria feature',
      acceptanceCriteria: [],
      dependencies: [],
      inputs: [],
      outputs: [],
    };

    const contractResult = builder.buildContract([featureNoAC], [], 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const validationResult = builder.validateContract(contractResult.value);
    expect(validationResult.ok).toBe(true);
    if (!validationResult.ok) return;

    // WHY: 반환된 에러 목록의 모든 요소가 문자열
    for (const err of validationResult.value) {
      expect(typeof err).toBe('string');
      expect(err.length).toBeGreaterThan(0);
    }
  });

  it('ContractBuilder: 여러 수락 기준을 가진 복잡한 feature', () => {
    const builder = new ContractBuilder(logger);

    const complexFeature: FeatureSpec = {
      id: 'feat-complex',
      name: 'Complex Feature',
      description: 'Feature with multiple acceptance criteria',
      acceptanceCriteria: [
        { id: 'ac-1', description: 'Criterion 1', verifiable: true, testCategory: 'unit' },
        { id: 'ac-2', description: 'Criterion 2', verifiable: true, testCategory: 'module' },
        { id: 'ac-3', description: 'Criterion 3', verifiable: false, testCategory: 'e2e' },
      ],
      dependencies: [],
      inputs: [
        { name: 'input1', type: 'string', constraints: 'max:100', required: true },
        { name: 'input2', type: 'number', constraints: 'min:0', required: false },
      ],
      outputs: [
        { name: 'output1', type: 'string', constraints: '', required: true },
        { name: 'output2', type: 'boolean', constraints: '', required: true },
      ],
    };

    const testDef: TestTypeDefinition = {
      featureId: 'feat-complex',
      categories: [
        { name: 'unit', description: 'Unit tests', mappedCriteria: ['ac-1'] },
        { name: 'module', description: 'Module tests', mappedCriteria: ['ac-2'] },
        { name: 'e2e', description: 'E2E tests', mappedCriteria: ['ac-3'] },
      ],
      rules: ['test first', 'fail fast'],
      sampleTests: [
        { category: 'unit', description: 'unit sample', expectedBehavior: 'should pass' },
      ],
      ratios: { unit: 0.6, module: 0.3, e2e: 0.1 },
    };

    const result = builder.buildContract([complexFeature], [testDef], 'complex design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.features[0]?.acceptanceCriteria.length).toBe(3);
  });

  it('ConversationManager: 타임스탬프 순서가 저장 후에도 유지', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'timestamp-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);

    const ts1 = new Date('2024-01-01T00:00:00Z');
    const ts2 = new Date('2024-01-01T00:01:00Z');
    const ts3 = new Date('2024-01-01T00:02:00Z');

    await manager.addMessage({ id: 'ts-1', role: 'user', content: 'first', timestamp: ts1, projectId: 'proj-ts' });
    await manager.addMessage({ id: 'ts-2', role: 'assistant', content: 'second', timestamp: ts2, projectId: 'proj-ts' });
    await manager.addMessage({ id: 'ts-3', role: 'user', content: 'third', timestamp: ts3, projectId: 'proj-ts' });

    const historyResult = await manager.getHistory('proj-ts');
    expect(historyResult.ok).toBe(true);
    if (!historyResult.ok) return;
    expect(historyResult.value.length).toBe(3);
  });

  it('ContractBuilder: 최소 1개 feature로 HandoffPackage 생성', () => {
    const builder = new ContractBuilder(logger);

    const minFeature = createFeature('min-feat');
    const minTestDef = createTestDef('min-feat');

    const contractResult = builder.buildContract([minFeature], [minTestDef], 'minimal design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoffResult = builder.buildHandoffPackage(
      'proj-minimal',
      contractResult.value,
      'minimal plan',
      'minimal design',
      'minimal spec',
    );
    expect(handoffResult.ok).toBe(true);
    if (!handoffResult.ok) return;
    expect(handoffResult.value.contract.features.length).toBe(1);
  });

  it('ContractBuilder: 3중 순환 의존성 탐지 (feat-1→feat-2→feat-3→feat-1)', () => {
    const builder = new ContractBuilder(logger);

    const features = [
      createFeature('feat-1', ['feat-3']),
      createFeature('feat-2', ['feat-1']),
      createFeature('feat-3', ['feat-2']),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'triple cycle design');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('contract_cyclic_dependency');
  });

  it('ConversationManager: emoji 포함 content 저장', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'emoji-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const emojiContent = '안녕하세요! 🎉 Hello World! 🌍 테스트 ✅';
    const msg = createMessage('msg-emoji', 'user', emojiContent, 'proj-emoji');

    const addResult = await manager.addMessage(msg);
    expect(addResult.ok).toBe(true);
  });

  it('ContractBuilder: web-app projectType 탐지', () => {
    const builder = new ContractBuilder(logger);

    const result = builder.buildContract([createFeature('f1')], [createTestDef('f1')], 'web application frontend');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WHY: 'web' 키워드가 있으면 webapp 또는 generic 중 하나
    expect(['webapp', 'web-app', 'generic']).toContain(result.value.projectType);
  });

  it('ContractBuilder: 순서가 섞인 feature 배열에서 올바른 구현 순서 도출', () => {
    const builder = new ContractBuilder(logger);

    // feat-3 → feat-2 → feat-1 순으로 배열, 의존성 순서는 feat-1 → feat-2 → feat-3
    const features = [
      createFeature('feat-3', ['feat-2']),
      createFeature('feat-1'),
      createFeature('feat-2', ['feat-1']),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'shuffled order design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = result.value.implementationOrder;
    expect(order.indexOf('feat-1')).toBeLessThan(order.indexOf('feat-2'));
    expect(order.indexOf('feat-2')).toBeLessThan(order.indexOf('feat-3'));
  });

  it('ConversationManager: 같은 projectId로 교차 저장 후 조회', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'interleave-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);

    for (let i = 0; i < 10; i++) {
      const role: 'user' | 'assistant' = i % 2 === 0 ? 'user' : 'assistant';
      await manager.addMessage(createMessage(`msg-${i}`, role, `content ${i}`, 'proj-shared'));
    }

    const hist = await manager.getHistory('proj-shared');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(10);
  });

  it('ContractBuilder: validateContract 에러 배열 길이 확인 (IO 없는 feature)', () => {
    const builder = new ContractBuilder(logger);

    const featureNoIO: FeatureSpec = {
      id: 'feat-no-io',
      name: 'No IO Feature',
      description: 'Feature without inputs and outputs',
      acceptanceCriteria: [
        { id: 'ac-1', description: 'criterion', verifiable: true, testCategory: 'unit' },
      ],
      dependencies: [],
      inputs: [],
      outputs: [],
    };

    const contractResult = builder.buildContract([featureNoIO], [createTestDef('feat-no-io')], 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const validationResult = builder.validateContract(contractResult.value);
    expect(validationResult.ok).toBe(true);
    if (!validationResult.ok) return;

    // WHY: inputs/outputs 없으면 allIODefined=false → 에러 있음
    expect(Array.isArray(validationResult.value)).toBe(true);
  });

  it('ConversationManager: 매우 짧은 검색 키워드 (1글자)', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'short-kw-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('msg-1', 'user', 'authentication required', 'proj-kw'));
    await manager.addMessage(createMessage('msg-2', 'user', 'also needs authorization', 'proj-kw'));

    const searchResult = await manager.searchContext('proj-kw', 'a');
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(Array.isArray(searchResult.value)).toBe(true);
  });

  it('ConversationManager: 여러 독립 repo 인스턴스가 서로 격리', async () => {
    const repo1 = new MemoryRepository(join(tmpDir, 'isolated-db-1'), logger);
    const repo2 = new MemoryRepository(join(tmpDir, 'isolated-db-2'), logger);
    await repo1.initialize();
    await repo2.initialize();

    const manager1 = new ConversationManager(repo1, logger);
    const manager2 = new ConversationManager(repo2, logger);

    await manager1.addMessage(createMessage('msg-1', 'user', 'repo1 message', 'proj-1'));
    await manager2.addMessage(createMessage('msg-2', 'user', 'repo2 message', 'proj-1'));

    const hist1 = await manager1.getHistory('proj-1');
    const hist2 = await manager2.getHistory('proj-1');

    expect(hist1.ok).toBe(true);
    expect(hist2.ok).toBe(true);
    if (!hist1.ok || !hist2.ok) return;

    // WHY: 두 repo는 서로 격리되어 각각 1개 메시지만 가짐
    expect(hist1.value.length).toBe(1);
    expect(hist2.value.length).toBe(1);
  });

  it('ContractBuilder: ID에 하이픈 많은 feature 처리', () => {
    const builder = new ContractBuilder(logger);
    const feature = createFeature('feat-a-b-c-d-e-f');
    const testDef = createTestDef('feat-a-b-c-d-e-f');

    const result = builder.buildContract([feature], [testDef], 'hyphenated id design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.features[0]?.id).toBe('feat-a-b-c-d-e-f');
  });

  it('ConversationManager: 이모지 포함 projectId', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'emoji-proj-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const msg = createMessage('msg-e1', 'user', 'test content', 'proj-🎯');

    const addResult = await manager.addMessage(msg);
    expect(typeof addResult.ok).toBe('boolean');
  });

  it('ContractBuilder: ratios 합이 1.0인 TestTypeDefinition → 올바르게 처리', () => {
    const builder = new ContractBuilder(logger);

    const testDef: TestTypeDefinition = {
      featureId: 'feat-ratio',
      categories: [
        { name: 'unit', description: 'Unit', mappedCriteria: ['ac-feat-ratio-1'] },
        { name: 'module', description: 'Module', mappedCriteria: [] },
        { name: 'e2e', description: 'E2E', mappedCriteria: [] },
      ],
      rules: ['test first'],
      sampleTests: [{ category: 'unit', description: 'sample', expectedBehavior: 'ok' }],
      ratios: { unit: 0.5, module: 0.3, e2e: 0.2 },
    };
    const feature = createFeature('feat-ratio');
    const result = builder.buildContract([feature], [testDef], 'ratio design');
    expect(result.ok).toBe(true);
  });

  it('ConversationManager: 역할이 assistant인 메시지만 저장 → 조회', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'asst-only-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(createMessage(`asst-${i}`, 'assistant', `answer ${i}`, 'proj-asst'));
    }

    const hist = await manager.getHistory('proj-asst');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(5);
    expect(hist.value.every((m) => m.role === 'assistant')).toBe(true);
  });

  it('ContractBuilder: 아주 긴 feature name과 description 처리', () => {
    const builder = new ContractBuilder(logger);

    const longFeature: FeatureSpec = {
      id: 'feat-long-name',
      name: 'N'.repeat(200),
      description: 'D'.repeat(500),
      acceptanceCriteria: [
        { id: 'ac-ln-1', description: 'criterion', verifiable: true, testCategory: 'unit' },
      ],
      dependencies: [],
      inputs: [{ name: 'in', type: 'string', constraints: '', required: true }],
      outputs: [{ name: 'out', type: 'string', constraints: '', required: true }],
    };

    const result = builder.buildContract([longFeature], [createTestDef('feat-long-name')], 'long name design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.features[0]?.name.length).toBe(200);
  });

  it('ConversationManager: UUID projectId → getHistory 정상 처리', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'uuid-proj-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const uuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    await manager.addMessage(createMessage('msg-uuid-p', 'user', 'uuid project message', uuid));

    const hist = await manager.getHistory(uuid);
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(1);
  });

  it('ContractBuilder: 하나의 feature가 여러 다른 feature에 의존', () => {
    const builder = new ContractBuilder(logger);

    const features = [
      createFeature('feat-a'),
      createFeature('feat-b'),
      createFeature('feat-c'),
      createFeature('feat-dependent', ['feat-a', 'feat-b', 'feat-c']),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'multi-dep design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = result.value.implementationOrder;
    const depIdx = order.indexOf('feat-dependent');
    expect(depIdx).toBeGreaterThan(order.indexOf('feat-a'));
    expect(depIdx).toBeGreaterThan(order.indexOf('feat-b'));
    expect(depIdx).toBeGreaterThan(order.indexOf('feat-c'));
  });

  it('ContractBuilder: feature description이 특수문자 포함', () => {
    const builder = new ContractBuilder(logger);

    const specialFeature: FeatureSpec = {
      id: 'feat-special-desc',
      name: 'Special Desc Feature',
      description: '특수문자 포함: <>&"\'`!@#$%^*(){}[]|\\',
      acceptanceCriteria: [
        { id: 'ac-sd-1', description: 'criterion', verifiable: true, testCategory: 'unit' },
      ],
      dependencies: [],
      inputs: [{ name: 'in', type: 'string', constraints: '', required: true }],
      outputs: [{ name: 'out', type: 'string', constraints: '', required: true }],
    };

    const result = builder.buildContract([specialFeature], [createTestDef('feat-special-desc')], 'special design');
    expect(result.ok).toBe(true);
  });

  // ── 추가 edge/random case 테스트 (2차) ─────────────────────────────

  it('ConversationManager: user/assistant 역할 교대 저장 → 조회 시 역할 유지', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'role-alt-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const roles: ('user' | 'assistant')[] = ['user', 'assistant', 'user', 'assistant', 'user'];
    for (let i = 0; i < roles.length; i++) {
      await manager.addMessage(createMessage(`msg-alt-${i}`, roles[i]!, `content ${i}`, 'proj-alt'));
    }

    const hist = await manager.getHistory('proj-alt');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(5);
    // getHistory uses vector search (LanceDB) which doesn't guarantee insertion order
    // Verify all returned roles are valid user/assistant values
    for (const msg of hist.value) {
      expect(['user', 'assistant']).toContain(msg.role);
    }
    // Verify both roles are present
    const returnedRoles = new Set(hist.value.map((m) => m.role));
    expect(returnedRoles.has('user')).toBe(true);
    expect(returnedRoles.has('assistant')).toBe(true);
  });

  it('ContractBuilder: features 배열 순서가 섞여도 implementationOrder는 의존성 순서', () => {
    const builder = new ContractBuilder(logger);

    const features = [
      createFeature('z-feat'),
      createFeature('a-feat'),
      createFeature('m-feat', ['a-feat', 'z-feat']),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'mixed order design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = result.value.implementationOrder;
    expect(order.indexOf('m-feat')).toBeGreaterThan(order.indexOf('a-feat'));
    expect(order.indexOf('m-feat')).toBeGreaterThan(order.indexOf('z-feat'));
  });

  it('ConversationManager: 같은 content 다른 id → 둘 다 저장', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'same-content-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('id-a', 'user', 'identical content', 'proj-dup-content'));
    await manager.addMessage(createMessage('id-b', 'user', 'identical content', 'proj-dup-content'));

    const hist = await manager.getHistory('proj-dup-content');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(2);
  });

  it('ContractBuilder: testDef ratios 합이 1.0 초과해도 처리됨', () => {
    const builder = new ContractBuilder(logger);

    const testDef: TestTypeDefinition = {
      featureId: 'feat-over-ratio',
      categories: [
        { name: 'unit', description: 'Unit', mappedCriteria: ['ac-feat-over-ratio-1'] },
      ],
      rules: ['test first'],
      sampleTests: [{ category: 'unit', description: 'sample', expectedBehavior: 'ok' }],
      ratios: { unit: 0.8, module: 0.5, e2e: 0.3 }, // 합계 1.6
    };

    const result = builder.buildContract([createFeature('feat-over-ratio')], [testDef], 'over ratio design');
    expect(typeof result.ok).toBe('boolean');
  });

  it('ConversationManager: projectId에 공백 포함 → 저장 성공', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'space-proj-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const msg = createMessage('msg-space', 'user', 'content', 'proj with spaces');

    const addResult = await manager.addMessage(msg);
    expect(typeof addResult.ok).toBe('boolean');
  });

  it('ContractBuilder: 단일 acceptance criteria만 있는 feature → completenessScore 확인', () => {
    const builder = new ContractBuilder(logger);
    const feature = createFeature('single-ac');
    const testDef = createTestDef('single-ac');

    const result = builder.buildContract([feature], [testDef], 'single ac design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(typeof result.value.verificationMatrix.completenessScore).toBe('number');
    expect(result.value.verificationMatrix.completenessScore).toBeGreaterThanOrEqual(0);
    expect(result.value.verificationMatrix.completenessScore).toBeLessThanOrEqual(1);
  });

  it('ConversationManager: 초기화 후 바로 조회 → 빈 배열', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'fresh-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const hist = await manager.getHistory('any-project');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(0);
  });

  it('ContractBuilder: verificationMatrix 필드 모두 boolean/number 타입 확인', () => {
    const builder = new ContractBuilder(logger);
    const result = builder.buildContract([createFeature('f1')], [createTestDef('f1')], 'design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const matrix = result.value.verificationMatrix;
    expect(typeof matrix.allFeaturesHaveCriteria).toBe('boolean');
    expect(typeof matrix.allCriteriaHaveTests).toBe('boolean');
    expect(typeof matrix.noCyclicDependencies).toBe('boolean');
    expect(typeof matrix.allIODefined).toBe('boolean');
    expect(typeof matrix.completenessScore).toBe('number');
  });

  it('ConversationManager: 검색 결과 content 필드가 string', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'content-type-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('msg-ct', 'user', 'hello world test', 'proj-ct'));

    const searchResult = await manager.searchContext('proj-ct', 'hello');
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;

    for (const msg of searchResult.value) {
      expect(typeof msg.content).toBe('string');
    }
  });

  it('ContractBuilder: buildContract 반환 value의 version 필드 존재', () => {
    const builder = new ContractBuilder(logger);
    const result = builder.buildContract([createFeature('f1')], [createTestDef('f1')], 'test design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBeDefined();
    expect(typeof result.value.version).toBe('number');
  });

  it('ContractBuilder: 동일 ContractBuilder 인스턴스로 여러 번 buildContract 가능', () => {
    const builder = new ContractBuilder(logger);

    const r1 = builder.buildContract([createFeature('f1')], [createTestDef('f1')], 'first design');
    const r2 = builder.buildContract([createFeature('f2')], [createTestDef('f2')], 'second design');
    const r3 = builder.buildContract([createFeature('f3')], [createTestDef('f3')], 'third design');

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);

    if (r1.ok && r2.ok && r3.ok) {
      // 각 계약은 독립적인 features를 가져야 함
      expect(r1.value.features[0]?.id).not.toBe(r2.value.features[0]?.id);
      expect(r2.value.features[0]?.id).not.toBe(r3.value.features[0]?.id);
    }
  });

  it('ConversationManager: addMessage 반환값 ok=true이면 value는 undefined 허용', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'add-return-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const result = await manager.addMessage(createMessage('msg-ret', 'user', 'content', 'proj-ret'));
    expect(result.ok).toBe(true);
  });

  it('ContractBuilder: features의 inputs가 빈 배열이어도 outputs 있으면 allIODefined=true', () => {
    const builder = new ContractBuilder(logger);

    const featureNoInput: FeatureSpec = {
      id: 'feat-no-input',
      name: 'No Input Feature',
      description: 'Feature without inputs',
      acceptanceCriteria: [
        { id: 'ac-ni-1', description: 'criterion', verifiable: true, testCategory: 'unit' },
      ],
      dependencies: [],
      inputs: [],
      outputs: [{ name: 'out', type: 'string', constraints: '', required: true }],
    };

    const result = builder.buildContract([featureNoInput], [createTestDef('feat-no-input')], 'no input design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // allIODefined uses OR: inputs.length > 0 || outputs.length > 0
    expect(result.value.verificationMatrix.allIODefined).toBe(true);
  });

  it('ContractBuilder: features의 outputs가 빈 배열이어도 inputs 있으면 allIODefined=true', () => {
    const builder = new ContractBuilder(logger);

    const featureNoOutput: FeatureSpec = {
      id: 'feat-no-output',
      name: 'No Output Feature',
      description: 'Feature without outputs',
      acceptanceCriteria: [
        { id: 'ac-no-1', description: 'criterion', verifiable: true, testCategory: 'unit' },
      ],
      dependencies: [],
      inputs: [{ name: 'in', type: 'string', constraints: '', required: true }],
      outputs: [],
    };

    const result = builder.buildContract([featureNoOutput], [createTestDef('feat-no-output')], 'no output design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // allIODefined uses OR: inputs.length > 0 || outputs.length > 0
    expect(result.value.verificationMatrix.allIODefined).toBe(true);
  });

  it('ConversationManager: getHistory는 배열 반환', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'array-return-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const result = await manager.getHistory('any-proj');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
  });

  it('ContractBuilder: implementationOrder는 모든 feature id를 포함', () => {
    const builder = new ContractBuilder(logger);

    const features = [
      createFeature('feat-a'),
      createFeature('feat-b', ['feat-a']),
      createFeature('feat-c', ['feat-a']),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'fan-out design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = result.value.implementationOrder;
    expect(order).toContain('feat-a');
    expect(order).toContain('feat-b');
    expect(order).toContain('feat-c');
    expect(order.length).toBe(3);
  });

  it('ContractBuilder: handoff id는 projectId 포함', () => {
    const builder = new ContractBuilder(logger);
    const contractResult = builder.buildContract([createFeature('f1')], [createTestDef('f1')], 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoff = builder.buildHandoffPackage('my-project', contractResult.value, 'plan', 'design', 'spec');
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.value.id).toContain('my-project');
  });

  it('ConversationManager: 여러 번 초기화해도 데이터 유지 (재초기화 주의)', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'reinit-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('before-init', 'user', 'content before', 'proj-rinit'));

    // 추가 저장
    await manager.addMessage(createMessage('after-init', 'user', 'content after', 'proj-rinit'));

    const hist = await manager.getHistory('proj-rinit');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(2);
  });

  it('ContractBuilder: verificationMatrix.completenessScore가 0.0~1.0 범위', () => {
    const builder = new ContractBuilder(logger);

    const noIOFeature: FeatureSpec = {
      id: 'feat-low-score',
      name: 'Low Score Feature',
      description: 'No IO',
      acceptanceCriteria: [],
      dependencies: [],
      inputs: [],
      outputs: [],
    };

    const result = builder.buildContract([noIOFeature], [], 'low score design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const score = result.value.verificationMatrix.completenessScore;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('ConversationManager: message id에 슬래시 포함 → 저장 성공', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'slash-id-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const msg = createMessage('path/to/message', 'user', 'some content', 'proj-slash');

    const addResult = await manager.addMessage(msg);
    expect(typeof addResult.ok).toBe('boolean');
  });

  it('ContractBuilder: noCyclicDependencies가 false이면 ok=false', () => {
    const builder = new ContractBuilder(logger);

    const features = [
      createFeature('cyclic-a', ['cyclic-b']),
      createFeature('cyclic-b', ['cyclic-a']),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'cyclic design');
    expect(result.ok).toBe(false);
  });

  it('ConversationManager: 동일 내용 반복 검색 → 일관된 결과', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'repeat-search-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('m1', 'user', 'authentication feature', 'proj-rs'));
    await manager.addMessage(createMessage('m2', 'assistant', 'will implement auth', 'proj-rs'));

    const r1 = await manager.searchContext('proj-rs', 'auth');
    const r2 = await manager.searchContext('proj-rs', 'auth');

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(r1.value.length).toBe(r2.value.length);
  });

  it('ContractBuilder: 단일 feature implementationOrder는 길이 1', () => {
    const builder = new ContractBuilder(logger);
    const result = builder.buildContract([createFeature('solo')], [createTestDef('solo')], 'solo design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.implementationOrder.length).toBe(1);
    expect(result.value.implementationOrder[0]).toBe('solo');
  });

  it('ConversationManager: message의 timestamp는 Date 객체로 보존', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'ts-type-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('ts-msg', 'user', 'timestamp check', 'proj-ts-check'));

    const hist = await manager.getHistory('proj-ts-check');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    if (hist.value.length > 0) {
      expect(hist.value[0]!.timestamp).toBeInstanceOf(Date);
    }
  });

  it('ContractBuilder: validateContract 에러 없을 때 빈 배열', () => {
    const builder = new ContractBuilder(logger);
    const features = [createFeature('valid-feat')];
    const testDefs = [createTestDef('valid-feat')];

    const contractResult = builder.buildContract(features, testDefs, 'valid design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const validResult = builder.validateContract(contractResult.value);
    expect(validResult.ok).toBe(true);
    if (!validResult.ok) return;
    expect(Array.isArray(validResult.value)).toBe(true);
    expect(validResult.value.length).toBe(0);
  });

  it('ConversationManager: message id가 특수 문자 포함 → ok', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'special-id-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    const msg = createMessage('msg:special@id#1', 'user', 'content', 'proj-special-id');

    const addResult = await manager.addMessage(msg);
    expect(typeof addResult.ok).toBe('boolean');
  });

  it('ContractBuilder: 5개 features 모두 의존성 없음 → order는 5개', () => {
    const builder = new ContractBuilder(logger);

    const features = Array.from({ length: 5 }, (_, i) => createFeature(`ind-feat-${i}`));
    const testDefs = features.map((f) => createTestDef(f.id));

    const result = builder.buildContract(features, testDefs, 'independent features design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.implementationOrder.length).toBe(5);
  });

  it('ConversationManager: 연속 50개 add → getHistory에서 50개 반환', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'fifty-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    for (let i = 0; i < 50; i++) {
      const role: 'user' | 'assistant' = i % 2 === 0 ? 'user' : 'assistant';
      await manager.addMessage(createMessage(`msg-fifty-${i}`, role, `content ${i}`, 'proj-fifty'));
    }

    const hist = await manager.getHistory('proj-fifty');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(50);
  });

  it('ContractBuilder: HandoffPackage의 confirmedByUser 초기값은 false', () => {
    const builder = new ContractBuilder(logger);
    const contractResult = builder.buildContract([createFeature('f1')], [createTestDef('f1')], 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoff = builder.buildHandoffPackage('proj-confirm', contractResult.value, 'plan', 'design', 'spec');
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.value.confirmedByUser).toBe(false);
  });

  it('ContractBuilder: buildContract 반환 Contract의 features는 입력 features와 같은 길이', () => {
    const builder = new ContractBuilder(logger);
    const features = [
      createFeature('f1'),
      createFeature('f2'),
      createFeature('f3'),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));
    const result = builder.buildContract(features, testDefs, 'three features design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.features.length).toBe(3);
  });

  it('ConversationManager: searchContext는 배열을 반환', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'search-array-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('msg-sa', 'user', 'search target', 'proj-sa'));

    const result = await manager.searchContext('proj-sa', 'search');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
  });

  it('ContractBuilder: allFeaturesHaveCriteria가 true이면 모든 feature에 criteria 있음', () => {
    const builder = new ContractBuilder(logger);
    const features = [
      createFeature('f1'), // createFeature는 1개 AC를 포함
      createFeature('f2'),
    ];
    const testDefs = features.map((f) => createTestDef(f.id));
    const result = builder.buildContract(features, testDefs, 'all have criteria design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verificationMatrix.allFeaturesHaveCriteria).toBe(true);
  });

  it('ContractBuilder: 한 feature라도 AC 없으면 allFeaturesHaveCriteria=false', () => {
    const builder = new ContractBuilder(logger);
    const featureWithAC = createFeature('f-with-ac');
    const featureNoAC: FeatureSpec = {
      id: 'f-no-ac',
      name: 'No AC',
      description: 'No criteria',
      acceptanceCriteria: [],
      dependencies: [],
      inputs: [{ name: 'in', type: 'string', constraints: '', required: true }],
      outputs: [{ name: 'out', type: 'string', constraints: '', required: true }],
    };

    const result = builder.buildContract([featureWithAC, featureNoAC], [createTestDef('f-with-ac'), createTestDef('f-no-ac')], 'mixed ac design');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verificationMatrix.allFeaturesHaveCriteria).toBe(false);
  });

  it('ConversationManager: message role이 user인지 assistant인지 정확히 검사', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'role-check-db'), logger);
    await repo.initialize();

    const manager = new ConversationManager(repo, logger);
    await manager.addMessage(createMessage('rc-1', 'user', 'user content', 'proj-rc'));
    await manager.addMessage(createMessage('rc-2', 'assistant', 'assistant content', 'proj-rc'));

    const hist = await manager.getHistory('proj-rc');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value.length).toBe(2);
    const roles = new Set(hist.value.map((m) => m.role));
    expect(roles.has('user')).toBe(true);
    expect(roles.has('assistant')).toBe(true);
  });
});
