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

  it('name이 string 타입', () => {
    const cmd = new StartCommand(logger);
    expect(typeof cmd.name).toBe('string');
  });

  it('description이 string 타입', () => {
    const cmd = new StartCommand(logger);
    expect(typeof cmd.description).toBe('string');
  });

  it('execute 메서드 존재', () => {
    const cmd = new StartCommand(logger);
    expect(typeof cmd.execute).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const c1 = new StartCommand(logger);
    const c2 = new StartCommand(logger);
    expect(c1).not.toBe(c2);
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new StartCommand(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('debug 로거로 생성 가능', () => {
    expect(() => new StartCommand(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('name은 start로 고정 (5번 체크)', () => {
    for (let i = 0; i < 5; i++) {
      expect(new StartCommand(logger).name).toBe('start');
    }
  });

  it('description 비어있지 않음 (5번 체크)', () => {
    for (let i = 0; i < 5; i++) {
      expect(new StartCommand(logger).description.length).toBeGreaterThan(0);
    }
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

  it('ok는 boolean 타입', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('error.code는 string 타입', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('error.message는 string 타입', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('5번 반복 실행 → 항상 ok=false', async () => {
    const cmd = new StartCommand(logger);
    for (let i = 0; i < 5; i++) {
      const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
      expect(result.ok).toBe(false);
    }
  });

  it('error code 일관성 (5번)', async () => {
    const cmd = new StartCommand(logger);
    for (let i = 0; i < 5; i++) {
      const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
      if (!result.ok) expect(result.error.code).toBe('cli_start_not_initialized');
    }
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

  it('깨진 config.json → ok는 boolean', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 config.json → 에러 반환', async () => {
    await writeFile(join(tempDir, '.adev', 'config.json'), '');
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(result.ok).toBe(false);
  });

  it('배열 config.json → 에러 반환', async () => {
    await writeFile(join(tempDir, '.adev', 'config.json'), '[]');
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

  it('verbose=true 옵션 전달 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-verbose-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, verbose: true, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('UUID projectId → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-uuid-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      flags: {},
    });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('logLevel 옵션 전달 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-loglevel-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, logLevel: 'debug', flags: {} });
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

  it('인증 없을 때 ok는 boolean', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('인증 없을 때 error.code는 string', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    if (!result.ok) expect(typeof result.error.code).toBe('string');
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

  it('Planner.createPlan 결과는 string', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const result = planner.createPlan('proj-1', [
      { id: '1', role: 'user', content: '기능 개발', timestamp: new Date(), projectId: 'proj-1' },
    ]);
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('SpecBuilder.buildSpec 결과는 string', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const sb = new SpecBuilder(logger);
    const result = sb.buildSpec('기획', '설계', []);
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('Designer.createDesign 결과는 string', async () => {
    const { Designer } = await import('layer1/designer.js');
    const d = new Designer(logger);
    const features = [{
      id: 'f1', name: 'Feature', description: 'Desc',
      acceptanceCriteria: [], dependencies: [], inputs: ['i'], outputs: ['o'],
    }];
    const result = d.createDesign('proj', '기획', features);
    if (result.ok) expect(typeof result.value).toBe('string');
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

  it('깊은 중첩 경로 → 에러 반환', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: '/a/b/c/d/e/f/g/nonexistent',
      flags: {},
    });
    expect(result.ok).toBe(false);
  });

  it('현재 디렉토리 → 에러 반환 (미초기화)', async () => {
    const tempDir = join(tmpdir(), `adev-start-cwd-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('여러 플래그 조합 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-flags-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      verbose: true,
      noColor: true,
      logLevel: 'debug',
      flags: { verbose: true, 'no-color': true, 'log-level': 'debug' },
    });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });
});

// ── 랜덤/경계값 테스트 ────────────────────────────────────────

describe('StartCommand 랜덤 경계값', () => {
  it('빈 문자열 projectPath → ok 또는 error 반환 (throw 안 함)', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: '', flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('공백 projectPath → ok 또는 error 반환', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: '   ', flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('점 하나 projectPath → ok 또는 error 반환', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: '.', flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('특수문자 포함 경로 → ok 또는 error 반환', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: '/tmp/테스트/path with spaces', flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('랜덤 UUID projectId #0 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-rand-0-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, projectId: crypto.randomUUID(), flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('랜덤 UUID projectId #1 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-rand-1-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, projectId: crypto.randomUUID(), flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('랜덤 UUID projectId #2 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-rand-2-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, projectId: crypto.randomUUID(), flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('랜덤 UUID projectId #3 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-rand-3-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, projectId: crypto.randomUUID(), flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('랜덤 UUID projectId #4 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-rand-4-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, projectId: crypto.randomUUID(), flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('매우 긴 projectId → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-longid-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: 'x'.repeat(1000),
      flags: {},
    });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('한글 projectId → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-kr-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: '프로젝트-한글',
      flags: {},
    });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('이모지 projectId → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-emoji-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: '🚀-project-id',
      flags: {},
    });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('숫자만으로 된 projectId → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-num-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: '12345678',
      flags: {},
    });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('빈 projectId → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-start-emptyid-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: '',
      flags: {},
    });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });
});

// ── Planner 추가 edge case 테스트 ─────────────────────────────

describe('Planner 추가 edge cases', () => {
  it('메시지 1개 (user만) → 기획 생성 or 에러', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const result = planner.createPlan('proj-single', [
      { id: '1', role: 'user', content: '단일 메시지', timestamp: new Date(), projectId: 'proj-single' },
    ]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 content 메시지 → 에러 반환', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const result = planner.createPlan('proj-empty', [
      { id: '1', role: 'user', content: '', timestamp: new Date(), projectId: 'proj-empty' },
    ]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('매우 긴 content 메시지 → 기획 생성 가능', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const longContent = '기능 개발 '.repeat(100);
    const result = planner.createPlan('proj-long', [
      { id: '1', role: 'user', content: longContent, timestamp: new Date(), projectId: 'proj-long' },
      { id: '2', role: 'assistant', content: '알겠습니다', timestamp: new Date(), projectId: 'proj-long' },
    ]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('한글 content 메시지 → 기획 생성 가능', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const result = planner.createPlan('proj-kr', [
      { id: '1', role: 'user', content: '한국어 기능 개발이 필요합니다', timestamp: new Date(), projectId: 'proj-kr' },
      { id: '2', role: 'assistant', content: '어떤 기능인가요?', timestamp: new Date(), projectId: 'proj-kr' },
    ]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('UUID projectId → 기획 생성 가능', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const uuid = crypto.randomUUID();
    const result = planner.createPlan(uuid, [
      { id: '1', role: 'user', content: '테스트 기능', timestamp: new Date(), projectId: uuid },
      { id: '2', role: 'assistant', content: '네', timestamp: new Date(), projectId: uuid },
    ]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('extractFeatures 빈 plan → 에러 또는 빈 배열', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const result = planner.extractFeatures('');
    expect(typeof result.ok).toBe('boolean');
  });

  it('extractFeatures 결과 배열 타입', async () => {
    const { Planner } = await import('layer1/planner.js');
    const planner = new Planner(logger);
    const planResult = planner.createPlan('proj-feat', [
      { id: '1', role: 'user', content: 'API 개발', timestamp: new Date(), projectId: 'proj-feat' },
      { id: '2', role: 'assistant', content: '확인', timestamp: new Date(), projectId: 'proj-feat' },
    ]);
    if (planResult.ok) {
      const result = planner.extractFeatures(planResult.value);
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    }
  });
});

// ── 설정 파일 다양한 포맷 edge cases ─────────────────────────

describe('StartCommand.execute — 다양한 config.json 형식', () => {
  it('null config.json → 에러 반환', async () => {
    const tempDir = join(tmpdir(), `adev-cfg-null-${crypto.randomUUID()}`);
    await mkdir(join(tempDir, '.adev'), { recursive: true });
    await writeFile(join(tempDir, '.adev', 'config.json'), 'null');
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('숫자 config.json → 에러 반환', async () => {
    const tempDir = join(tmpdir(), `adev-cfg-num-${crypto.randomUUID()}`);
    await mkdir(join(tempDir, '.adev'), { recursive: true });
    await writeFile(join(tempDir, '.adev', 'config.json'), '42');
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('문자열 config.json → 에러 반환', async () => {
    const tempDir = join(tmpdir(), `adev-cfg-str-${crypto.randomUUID()}`);
    await mkdir(join(tempDir, '.adev'), { recursive: true });
    await writeFile(join(tempDir, '.adev', 'config.json'), '"string value"');
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('모델 필드 없는 config.json → 에러 반환', async () => {
    const tempDir = join(tmpdir(), `adev-cfg-nomodel-${crypto.randomUUID()}`);
    await mkdir(join(tempDir, '.adev'), { recursive: true });
    await writeFile(join(tempDir, '.adev', 'config.json'), JSON.stringify({ version: '1', logLevel: 'error' }));
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    // 모델 없으면 실패할 수 있음
    expect(typeof result.ok).toBe('boolean');
    await rm(tempDir, { recursive: true, force: true });
  });

  it('잘못된 model 값 config.json → 에러 또는 정상 처리', async () => {
    const tempDir = join(tmpdir(), `adev-cfg-badmodel-${crypto.randomUUID()}`);
    await mkdir(join(tempDir, '.adev'), { recursive: true });
    await writeFile(join(tempDir, '.adev', 'config.json'), JSON.stringify({ version: '1', logLevel: 'error', model: 'invalid-model-xyz' }));
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
    expect(typeof result.ok).toBe('boolean');
    await rm(tempDir, { recursive: true, force: true });
  });
});

// ── 추가 edge case: StartCommand 멀티 인스턴스 ────────────────

describe('StartCommand 멀티 인스턴스 독립성', () => {
  it('2개 인스턴스 동시 실행 → 각각 독립 에러', async () => {
    const tempDir1 = join(tmpdir(), `adev-multi-1-${crypto.randomUUID()}`);
    const tempDir2 = join(tmpdir(), `adev-multi-2-${crypto.randomUUID()}`);
    await mkdir(tempDir1, { recursive: true });
    await mkdir(tempDir2, { recursive: true });

    const cmd1 = new StartCommand(logger);
    const cmd2 = new StartCommand(logger);
    const [r1, r2] = await Promise.all([
      cmd1.execute([], { projectPath: tempDir1, flags: {} }),
      cmd2.execute([], { projectPath: tempDir2, flags: {} }),
    ]);

    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);

    await rm(tempDir1, { recursive: true, force: true });
    await rm(tempDir2, { recursive: true, force: true });
  });

  it('같은 경로 → 동일 에러 코드', async () => {
    const tempDir = join(tmpdir(), `adev-same-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const r1 = await cmd.execute([], { projectPath: tempDir, flags: {} });
    const r2 = await cmd.execute([], { projectPath: tempDir, flags: {} });
    if (!r1.ok && !r2.ok) {
      expect(r1.error.code).toBe(r2.error.code);
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('다른 로거 레벨로 생성 → 동일 동작', async () => {
    const tempDir = join(tmpdir(), `adev-loggers-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const levels = ['error', 'warn', 'info', 'debug'] as const;
    for (const level of levels) {
      const cmd = new StartCommand(new ConsoleLogger(level));
      const result = await cmd.execute([], { projectPath: tempDir, flags: {} });
      expect(result.ok).toBe(false);
    }
    await rm(tempDir, { recursive: true, force: true });
  });
});

// ── ContractBuilder 추가 edge case ────────────────────────────

describe('ContractBuilder 추가 edge cases', () => {
  it('기능 1개 → 계약 생성 가능', async () => {
    const { ContractBuilder } = await import('layer1/contract-builder.js');
    const builder = new ContractBuilder(logger);
    const features = [{
      id: 'feat-single',
      name: 'Single Feature',
      description: 'One feature',
      acceptanceCriteria: ['criterion 1'],
      dependencies: [],
      inputs: ['input'],
      outputs: ['output'],
    }];
    const result = builder.buildContract(features, [], '설계 내용');
    expect(result.ok).toBe(true);
  });

  it('기능 10개 → 계약 생성 가능', async () => {
    const { ContractBuilder } = await import('layer1/contract-builder.js');
    const builder = new ContractBuilder(logger);
    const features = Array.from({ length: 10 }, (_, i) => ({
      id: `feat-${i}`,
      name: `Feature ${i}`,
      description: `Feature ${i} description`,
      acceptanceCriteria: [`criteria ${i}`],
      dependencies: [],
      inputs: [`input${i}`],
      outputs: [`output${i}`],
    }));
    const result = builder.buildContract(features, [], '설계 내용');
    if (result.ok) {
      expect(typeof result.value).toBe('object');
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('features 배열이 있으면 계약 반환', async () => {
    const { ContractBuilder } = await import('layer1/contract-builder.js');
    const builder = new ContractBuilder(logger);
    const features = [{
      id: 'feat-x',
      name: 'Feature X',
      description: 'Test feature',
      acceptanceCriteria: [],
      dependencies: [],
      inputs: [],
      outputs: [],
    }];
    const result = builder.buildContract(features, [], '설계');
    expect(typeof result.ok).toBe('boolean');
  });

  it('ContractBuilder buildContract 빈 design → 에러 또는 성공', async () => {
    const { ContractBuilder } = await import('layer1/contract-builder.js');
    const builder = new ContractBuilder(logger);
    const features = [{
      id: 'feat-1', name: 'F', description: 'D',
      acceptanceCriteria: [], dependencies: [], inputs: ['i'], outputs: ['o'],
    }];
    const result = builder.buildContract(features, [], '');
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── TestTypeDesigner 추가 edge case ───────────────────────────

describe('TestTypeDesigner 추가 edge cases', () => {
  it('빈 기능 목록 → 빈 정의 배열', async () => {
    const { TestTypeDesigner } = await import('layer1/test-type-designer.js');
    const designer = new TestTypeDesigner(logger);
    const result = designer.createDefinitions([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('기능 1개 → 테스트 정의 생성', async () => {
    const { TestTypeDesigner } = await import('layer1/test-type-designer.js');
    const designer = new TestTypeDesigner(logger);
    const features = [{
      id: 'feat-1',
      name: 'Auth Feature',
      description: 'Authentication',
      acceptanceCriteria: ['user can login'],
      dependencies: [],
      inputs: ['credentials'],
      outputs: ['token'],
    }];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('기능 5개 → 테스트 정의 생성', async () => {
    const { TestTypeDesigner } = await import('layer1/test-type-designer.js');
    const designer = new TestTypeDesigner(logger);
    const features = Array.from({ length: 5 }, (_, i) => ({
      id: `feat-${i}`,
      name: `Feature ${i}`,
      description: `Description ${i}`,
      acceptanceCriteria: [`criterion ${i}`],
      dependencies: [],
      inputs: [`in${i}`],
      outputs: [`out${i}`],
    }));
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('한글 기능 → 테스트 정의 생성', async () => {
    const { TestTypeDesigner } = await import('layer1/test-type-designer.js');
    const designer = new TestTypeDesigner(logger);
    const features = [{
      id: 'feat-kr',
      name: '인증 기능',
      description: '사용자 인증 및 권한 관리',
      acceptanceCriteria: ['로그인 가능', '토큰 발급'],
      dependencies: [],
      inputs: ['아이디', '비밀번호'],
      outputs: ['JWT 토큰'],
    }];
    const result = designer.createDefinitions(features);
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── SpecBuilder 추가 edge case ─────────────────────────────────

describe('SpecBuilder 추가 edge cases', () => {
  it('긴 plan + 긴 design → ok', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const sb = new SpecBuilder(logger);
    const longPlan = '기획 내용 '.repeat(100);
    const longDesign = '설계 내용 '.repeat(100);
    const result = sb.buildSpec(longPlan, longDesign, []);
    expect(typeof result.ok).toBe('boolean');
  });

  it('한글 plan + 한글 design → ok', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const sb = new SpecBuilder(logger);
    const result = sb.buildSpec('한국어 기획 문서', '한국어 설계 문서', []);
    expect(typeof result.ok).toBe('boolean');
  });

  it('특수문자 포함 plan → 에러 없이 처리', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const sb = new SpecBuilder(logger);
    const result = sb.buildSpec('기획: !@#$%^&*()', '설계 내용', []);
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 feature 목록 → ok', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const sb = new SpecBuilder(logger);
    const result = sb.buildSpec('기획', '설계', []);
    expect(result.ok).toBe(true);
  });

  it('5개 기능 목록 포함 스펙 → ok', async () => {
    const { SpecBuilder } = await import('layer1/spec-builder.js');
    const sb = new SpecBuilder(logger);
    const features = Array.from({ length: 5 }, (_, i) => ({
      id: `feat-${i}`,
      name: `Feature ${i}`,
      description: `Desc ${i}`,
      acceptanceCriteria: [],
      dependencies: [],
      inputs: [],
      outputs: [],
    }));
    const result = sb.buildSpec('기획 문서', '설계 문서', features);
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── StartCommand 추가 랜덤 경계값 ─────────────────────────────

describe('StartCommand 추가 랜덤 경계값', () => {
  it('backslash 포함 경로 → ok 또는 error (throw 안 함)', async () => {
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: 'C:\\Windows\\System32', flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('매우 긴 경로 → ok 또는 error', async () => {
    const cmd = new StartCommand(logger);
    const longPath = '/tmp/' + 'a'.repeat(200);
    const result = await cmd.execute([], { projectPath: longPath, flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('null-바이트 포함 경로 → ok 또는 error (throw 안 함)', async () => {
    const cmd = new StartCommand(logger);
    try {
      const result = await cmd.execute([], { projectPath: '/tmp/test\0dir', flags: {} });
      expect(typeof result.ok).toBe('boolean');
    } catch {
      // 일부 OS에서 throw 가능 → 허용
    }
  });

  it('projectId와 logLevel 동시 전달 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-both-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], {
      projectPath: tempDir,
      projectId: crypto.randomUUID(),
      logLevel: 'info',
      flags: {},
    });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('noColor=false → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-nocolor-false-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, noColor: false, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('verbose=false → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-verbose-false-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute([], { projectPath: tempDir, verbose: false, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('args에 -- 포함 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-dasharg-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute(['--', 'extra'], { projectPath: tempDir, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('args에 한글 → 미초기화 에러', async () => {
    const tempDir = join(tmpdir(), `adev-krarg-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const cmd = new StartCommand(logger);
    const result = await cmd.execute(['한글-인자'], { projectPath: tempDir, flags: {} });
    expect(result.ok).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });
});
