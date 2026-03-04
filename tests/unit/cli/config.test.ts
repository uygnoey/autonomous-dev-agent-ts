import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ConfigCommand } from '../../../src/cli/commands/config.js';
import { getNestedValue, parseConfigValue, setNestedValue } from '../../../src/cli/commands/config.js';
import type { CliOptions } from '../../../src/cli/types.js';
import { DEFAULT_CONFIG } from '../../../src/core/config.js';
import { ConsoleLogger } from '../../../src/core/logger.js';

// ── 테스트 헬퍼 / Test Helpers ────────────────────────────────

const logger = new ConsoleLogger('error');

function makeOptions(projectPath: string): CliOptions {
  return { projectPath, flags: {} };
}

// ── ConfigCommand ─────────────────────────────────────────────

describe('ConfigCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-config-test-${crypto.randomUUID()}`);
    const adevDir = join(tempDir, '.adev');
    await mkdir(adevDir, { recursive: true });
    await Bun.write(join(adevDir, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('list: 현재 설정을 표시한다', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['list'], makeOptions(tempDir));

    expect(result.ok).toBe(true);
  });

  it('get: dot notation 키로 값을 조회한다', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['get', 'log.level'], makeOptions(tempDir));

    expect(result.ok).toBe(true);
  });

  it('get: 존재하지 않는 키는 에러를 반환한다', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['get', 'nonexistent.key'], makeOptions(tempDir));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_config_key_not_found');
    }
  });

  it('set: 설정 값을 수정한다', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));

    expect(result.ok).toBe(true);

    // 파일에서 직접 확인 / Verify from file
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const content = await Bun.file(configPath).text();
    const config = JSON.parse(content);
    expect(config.log.level).toBe('debug');
  });

  it('set: 숫자 값을 올바르게 파싱한다', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'testing.unitCount', '5000'], makeOptions(tempDir));

    const configPath = resolve(tempDir, '.adev', 'config.json');
    const content = await Bun.file(configPath).text();
    const config = JSON.parse(content);
    expect(config.testing.unitCount).toBe(5000);
  });

  it('set: boolean 값을 올바르게 파싱한다', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(
      ['set', 'verification.opusEscalationOnFailure', 'false'],
      makeOptions(tempDir),
    );

    const configPath = resolve(tempDir, '.adev', 'config.json');
    const content = await Bun.file(configPath).text();
    const config = JSON.parse(content);
    expect(config.verification.opusEscalationOnFailure).toBe(false);
  });

  it('서브커맨드 없이 실행하면 에러를 반환한다', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute([], makeOptions(tempDir));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_config_missing_subcommand');
    }
  });

  it('알 수 없는 서브커맨드는 에러를 반환한다', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['unknown'], makeOptions(tempDir));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_config_unknown_subcommand');
    }
  });

  it('get: 키 없이 실행하면 에러를 반환한다', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['get'], makeOptions(tempDir));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_config_missing_key');
    }
  });

  it('set: 키와 값 없이 실행하면 에러를 반환한다', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['set'], makeOptions(tempDir));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_config_missing_args');
    }
  });

  it('set: .adev/ 디렉토리가 없으면 빈 설정에 값을 추가한다', async () => {
    // 빈 config.json으로 재설정
    const configPath = resolve(tempDir, '.adev', 'config.json');
    await Bun.write(configPath, '{}');

    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['set', 'log.level', 'warn'], makeOptions(tempDir));

    expect(result.ok).toBe(true);

    const content = await Bun.file(configPath).text();
    const config = JSON.parse(content);
    expect(config.log.level).toBe('warn');
  });
});

// ── getNestedValue ────────────────────────────────────────────

describe('getNestedValue', () => {
  it('단일 키로 값을 가져온다', () => {
    expect(getNestedValue({ name: 'test' }, 'name')).toBe('test');
  });

  it('중첩 키로 값을 가져온다', () => {
    expect(getNestedValue({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('존재하지 않는 키는 undefined를 반환한다', () => {
    expect(getNestedValue({ a: 1 }, 'b')).toBeUndefined();
  });

  it('중간 경로가 없으면 undefined를 반환한다', () => {
    expect(getNestedValue({ a: 1 }, 'a.b.c')).toBeUndefined();
  });

  it('null 값 중간에서 undefined를 반환한다', () => {
    expect(getNestedValue({ a: null } as Record<string, unknown>, 'a.b')).toBeUndefined();
  });
});

// ── setNestedValue ────────────────────────────────────────────

describe('setNestedValue', () => {
  it('단일 키로 값을 설정한다', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'name', 'test');
    expect(obj.name).toBe('test');
  });

  it('중첩 키로 값을 설정한다', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 42);
    expect((obj as { a: { b: { c: number } } }).a.b.c).toBe(42);
  });

  it('기존 값을 덮어쓴다', () => {
    const obj: Record<string, unknown> = { log: { level: 'info' } };
    setNestedValue(obj, 'log.level', 'debug');
    expect((obj as { log: { level: string } }).log.level).toBe('debug');
  });

  it('중간 경로가 없으면 생성한다', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'deep.nested.key', true);
    expect((obj as { deep: { nested: { key: boolean } } }).deep.nested.key).toBe(true);
  });
});

// ── parseConfigValue ──────────────────────────────────────────

describe('parseConfigValue', () => {
  it('"true"를 boolean으로 파싱한다', () => {
    expect(parseConfigValue('true')).toBe(true);
  });

  it('"false"를 boolean으로 파싱한다', () => {
    expect(parseConfigValue('false')).toBe(false);
  });

  it('"null"을 null로 파싱한다', () => {
    expect(parseConfigValue('null')).toBeNull();
  });

  it('숫자 문자열을 number로 파싱한다', () => {
    expect(parseConfigValue('42')).toBe(42);
    expect(parseConfigValue('3.14')).toBe(3.14);
    expect(parseConfigValue('0')).toBe(0);
  });

  it('일반 문자열은 그대로 반환한다', () => {
    expect(parseConfigValue('hello')).toBe('hello');
    expect(parseConfigValue('info')).toBe('info');
  });

  it('빈 문자열은 그대로 반환한다', () => {
    expect(parseConfigValue('')).toBe('');
  });
});
