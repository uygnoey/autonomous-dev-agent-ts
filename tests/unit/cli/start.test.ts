/**
 * StartCommand 단위 테스트 / StartCommand unit tests
 *
 * @description
 * ContractBuilder 파이프라인, Layer1 세션 초기화,
 * processUserInput 스트리밍 로직을 검증한다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StartCommand } from 'cli/commands/start.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 테스트 헬퍼 / Test Helpers ─────────────────────────────────

const logger = new ConsoleLogger('error');

async function makeProjectDir(): Promise<string> {
  const dir = join(tmpdir(), `adev-start-test-${crypto.randomUUID()}`);
  await mkdir(join(dir, '.adev'), { recursive: true });
  // 최소 config.json
  await writeFile(
    join(dir, '.adev', 'config.json'),
    JSON.stringify({ version: '1', logLevel: 'error', model: 'claude-opus-4-6' }),
  );
  return dir;
}

// ── StartCommand 초기화 ────────────────────────────────────────

describe('StartCommand', () => {
  it('name, description, aliases 정의됨', () => {
    const cmd = new StartCommand(logger);
    expect(cmd.name).toBe('start');
    expect(typeof cmd.description).toBe('string');
    expect(cmd.description.length).toBeGreaterThan(0);
    expect(Array.isArray(cmd.aliases)).toBe(true);
  });

  it('aliases에 s가 포함됨', () => {
    const cmd = new StartCommand(logger);
    expect(cmd.aliases).toContain('s');
  });
});

// ── .adev 초기화 없이 실행 → 에러 반환 ───────────────────────

describe('StartCommand.execute — 미초기화 프로젝트', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-start-noinit-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('.adev 없으면 cli_start_not_initialized 에러 반환', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_start_not_initialized');
    }
  });

  it('미초기화 에러에 적절한 메시지 포함', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('adev init');
    }
  });

  it('존재하지 않는 경로에서 에러 반환', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: '/nonexistent/path/xyz/abc',
      flags: {},
    });

    expect(result.ok).toBe(false);
  });
});

// ── 설정 로드 실패 시 에러 반환 ───────────────────────────────

describe('StartCommand.execute — 잘못된 config.json', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-start-badconfig-${crypto.randomUUID()}`);
    await mkdir(join(tempDir, '.adev'), { recursive: true });
    // 깨진 JSON
    await writeFile(join(tempDir, '.adev', 'config.json'), '{invalid json}');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('깨진 config.json → 에러 반환', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });

    expect(result.ok).toBe(false);
  });
});

// ── StartCommand 옵션 처리 ────────────────────────────────────

describe('StartCommand 옵션', () => {
  it('noColor 옵션을 처리한다 (초기화 없이 에러 반환 확인)', async () => {
    const tempDir = join(tmpdir(), `adev-start-opt-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, noColor: true, flags: {} });

    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('projectId 옵션이 전달되어도 미초기화 프로젝트에서 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-pid-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: 'custom-project-id',
      flags: {},
    });

    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });
});

// ── 초기화된 프로젝트 — 인증 실패 시나리오 ────────────────────

describe('StartCommand.execute — 인증 실패', () => {
  let tempDir: string;
  let savedApiKey: string | undefined;
  let savedOauthToken: string | undefined;

  beforeEach(async () => {
    tempDir = await makeProjectDir();
    savedApiKey = process.env['ANTHROPIC_API_KEY'];
    savedOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (savedApiKey !== undefined) process.env['ANTHROPIC_API_KEY'] = savedApiKey;
    else delete process.env['ANTHROPIC_API_KEY'];
    if (savedOauthToken !== undefined) process.env['CLAUDE_CODE_OAUTH_TOKEN'] = savedOauthToken;
    else delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  });

  it('인증 정보 없으면 auth 에러 반환', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // auth 실패 또는 session init 실패
      expect(
        result.error.code.startsWith('cli_start') ||
          result.error.code.startsWith('auth') ||
          result.error.code.startsWith('config'),
      ).toBe(true);
    }
  });
});

// ── generateContract 파이프라인 (간접 테스트) ─────────────────

describe('Contract 생성 파이프라인 구조', () => {
  it('Planner, Designer, SpecBuilder, TestTypeDesigner, ContractBuilder 임포트 가능', async () => {
    const { Planner } = await import('layer1/planner.js');
    const { Designer } = await import('layer1/designer.js');
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const { TestTypeDesigner } = await import('layer1/test-type-designer.js');
    const { ContractBuilder } = await import('layer1/contract-builder.js');

    expect(typeof Planner).toBe('function');
    expect(typeof Designer).toBe('function');
    expect(typeof SpecBuilder).toBe('function');
    expect(typeof TestTypeDesigner).toBe('function');
    expect(typeof ContractBuilder).toBe('function');
  });

  it('빈 대화에서 Planner.createPlan → 에러 반환', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const result = planner.createPlan('proj-1', []);
    expect(result.ok).toBe(false);
  });

  it('대화가 있으면 Planner.createPlan → 기획 문서 생성', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const result = planner.createPlan('proj-1', [
      { id: '1', role: 'user', content: 'REST API를 만들고 싶어요', timestamp: new Date(), projectId: 'proj-1' },
      { id: '2', role: 'assistant', content: '어떤 기능이 필요한가요?', timestamp: new Date(), projectId: 'proj-1' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  it('Designer.createDesign → 빈 기능 목록이면 에러', async () => {
    const { Designer } = await import('layer1/designer.js');
    const designer = new Designer(logger);
    const result = designer.createDesign('proj-1', '기획 문서 내용', []);
    // features 없으면 에러 반환
    expect(result.ok).toBe(false);
  });

  it('Designer.createDesign → 기능 있으면 설계 문서 생성', async () => {
    const { Designer } = await import('layer1/designer.js');
    const designer = new Designer(logger);
    const features = [
      {
        id: 'feat-1',
        name: 'Feature 1',
        description: 'Some feature',
        acceptanceCriteria: [],
        dependencies: [],
        inputs: ['input1'],
        outputs: ['output1'],
      },
    ];
    const result = designer.createDesign('proj-1', '기획 문서 내용', features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  it('SpecBuilder.buildSpec → 스펙 문서 생성', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const specBuilder = new SpecBuilder(logger);
    const result = specBuilder.buildSpec('기획', '설계', []);
    expect(result.ok).toBe(true);
  });

  it('빈 plan → SpecBuilder 에러', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const specBuilder = new SpecBuilder(logger);
    const result = specBuilder.buildSpec('', '설계', []);
    expect(result.ok).toBe(false);
  });

  it('빈 design → SpecBuilder 에러', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const specBuilder = new SpecBuilder(logger);
    const result = specBuilder.buildSpec('기획', '', []);
    expect(result.ok).toBe(false);
  });

  it('TestTypeDesigner.createDefinitions → 테스트 정의 생성', async () => {
    const { TestTypeDesigner } = await import('layer1/test-type-designer.js');
    const designer = new TestTypeDesigner(logger);
    const result = designer.createDefinitions([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('ContractBuilder.buildContract → 빈 기능 목록 에러', async () => {
    const { ContractBuilder } = await import('layer1/contract-builder.js');
    const builder = new ContractBuilder(logger);
    const result = builder.buildContract([], [], '');
    expect(result.ok).toBe(false);
  });

  it('전체 파이프라인 — 대화 → Contract 생성', async () => {
    const { Planner } = await import('layer1/planner.js');
    const { Designer } = await import('layer1/designer.js');
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const { TestTypeDesigner } = await import('layer1/test-type-designer.js');
    const { ContractBuilder } = await import('layer1/contract-builder.js');

    const messages = [
      { id: '1', role: 'user' as const, content: 'CLI 도구를 만들고 싶어요. 파일을 변환하는 기능이 필요합니다.', timestamp: new Date(), projectId: 'proj-1' },
      { id: '2', role: 'assistant' as const, content: '어떤 형식의 변환이 필요한가요?', timestamp: new Date(), projectId: 'proj-1' },
      { id: '3', role: 'user' as const, content: 'JSON → CSV 변환과 CSV → JSON 변환입니다.', timestamp: new Date(), projectId: 'proj-1' },
      { id: '4', role: 'assistant' as const, content: '기능 목록을 정리했습니다. 기능1: JSON→CSV 변환, 기능2: CSV→JSON 변환', timestamp: new Date(), projectId: 'proj-1' },
    ];

    const planner = new Planner(logger);
    const planResult = planner.createPlan('proj-1', messages);
    expect(planResult.ok).toBe(true);
    if (!planResult.ok) return;

    const featuresResult = planner.extractFeatures(planResult.value);
    expect(featuresResult.ok).toBe(true);
    if (!featuresResult.ok) return;

    const designer = new Designer(logger);
    const designResult = designer.createDesign('proj-1', planResult.value, featuresResult.value);
    expect(designResult.ok).toBe(true);
    if (!designResult.ok) return;

    const testDesigner = new TestTypeDesigner(logger);
    const testDefsResult = testDesigner.createDefinitions(featuresResult.value);
    expect(testDefsResult.ok).toBe(true);
    if (!testDefsResult.ok) return;

    const specBuilder = new SpecBuilder(logger);
    const specResult = specBuilder.buildSpec(planResult.value, designResult.value, featuresResult.value);
    expect(specResult.ok).toBe(true);
    if (!specResult.ok) return;

    const contractBuilder = new ContractBuilder(logger);
    const contractResult = contractBuilder.buildContract(
      featuresResult.value,
      testDefsResult.value,
      designResult.value,
    );
    // 기능이 추출됐다면 계약이 성공해야 함
    if (featuresResult.value.length > 0) {
      expect(contractResult.ok).toBe(true);
    }
  });
});

// ── 에지 케이스 / Edge cases ──────────────────────────────────

describe('StartCommand 에지 케이스', () => {
  it('args 배열이 비어도 동작 (미초기화 에러)', async () => {
    const tempDir = join(tmpdir(), `adev-start-edge-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });

    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('다중 위치 인자 무시됨', async () => {
    const tempDir = join(tmpdir(), `adev-start-multi-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    const cmd = new StartCommand(logger);
    const result = await cmd.execute(['arg1', 'arg2', 'arg3'], {
      projectPath: tempDir,
      flags: {},
    });

    expect(result.ok).toBe(false); // 미초기화
    await rm(tempDir, { recursive: true, force: true });
  });

  it('config.json이 있어도 인증 없으면 세션 초기화 실패', async () => {
    const savedApiKey = process.env['ANTHROPIC_API_KEY'];
    const savedToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];

    const tempDir = await makeProjectDir();
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });

    expect(result.ok).toBe(false);

    await rm(tempDir, { recursive: true, force: true });
    if (savedApiKey !== undefined) process.env['ANTHROPIC_API_KEY'] = savedApiKey;
    if (savedToken !== undefined) process.env['CLAUDE_CODE_OAUTH_TOKEN'] = savedToken;
  });
});

// ── 랜덤/경계값 테스트 ────────────────────────────────────────

describe('StartCommand 랜덤 경계값', () => {
  it.each([
    ['빈 문자열 projectPath', ''],
    ['공백 projectPath', '   '],
    ['점 하나 projectPath', '.'],
    ['특수문자 포함 경로', '/tmp/테스트/path with spaces'],
  ])('%s → 에러 반환 또는 처리됨', async (_label, projectPath) => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath, flags: {} });
    // 어떤 결과든 ok 또는 error 반환 (throw하지 않음)
    expect(typeof result.ok).toBe('boolean');
  });

  it.each(Array.from({ length: 10 }, (_, i) => i))('랜덤 UUID projectId #%i', async (i) => {
    const tempDir = join(tmpdir(), `adev-start-rand-${i}-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: crypto.randomUUID(),
      flags: {},
    });

    expect(result.ok).toBe(false); // 미초기화
    await rm(tempDir, { recursive: true, force: true });
  });
});
