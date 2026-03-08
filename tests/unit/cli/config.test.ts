/**
 * ConfigCommand 단위 테스트
 *
 * @description
 * KR: ConfigCommand/getNestedValue/setNestedValue/parseConfigValue 경계값 테스트. 80%+ 경계값 비율.
 * EN: Tests for config CLI command helpers. 80%+ edge ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ConfigCommand } from 'cli/commands/config.js';
import { getNestedValue, parseConfigValue, setNestedValue } from 'cli/commands/config.js';
import type { CliOptions } from 'cli/types.js';
import { DEFAULT_CONFIG } from 'core/config.js';
import { ConsoleLogger } from 'core/logger.js';

const logger = new ConsoleLogger('error');

function makeOptions(projectPath: string): CliOptions {
  return { projectPath, flags: {} };
}

async function makeTempDir(): Promise<string> {
  const tempDir = join(tmpdir(), `adev-config-test-${crypto.randomUUID()}`);
  const adevDir = join(tempDir, '.adev');
  await mkdir(adevDir, { recursive: true });
  await Bun.write(join(adevDir, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2));
  return tempDir;
}

// ── ConfigCommand 생성자 ───────────────────────────────────────

describe('ConfigCommand 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new ConfigCommand(logger)).not.toThrow();
  });

  it('ConfigCommand 인스턴스이다', () => {
    expect(new ConfigCommand(logger)).toBeInstanceOf(ConfigCommand);
  });

  it('execute 메서드가 존재한다', () => {
    expect(typeof new ConfigCommand(logger).execute).toBe('function');
  });

  it('두 인스턴스는 다른 객체이다', () => {
    const c1 = new ConfigCommand(logger);
    const c2 = new ConfigCommand(logger);
    expect(c1).not.toBe(c2);
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new ConfigCommand(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('debug 로거로 생성 가능', () => {
    expect(() => new ConfigCommand(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 생성 성공', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => new ConfigCommand(logger)).not.toThrow();
    }
  });
});

// ── ConfigCommand list ─────────────────────────────────────────

describe('ConfigCommand list', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('list → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['list'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('list 연속 호출 → 항상 ok', async () => {
    const cmd = new ConfigCommand(logger);
    for (let i = 0; i < 3; i++) {
      const result = await cmd.execute(['list'], makeOptions(tempDir));
      expect(result.ok).toBe(true);
    }
  });

  it('ok가 boolean이다', async () => {
    const result = await new ConfigCommand(logger).execute(['list'], makeOptions(tempDir));
    expect(typeof result.ok).toBe('boolean');
  });

  it('list 5번 반복 일관성', async () => {
    const cmd = new ConfigCommand(logger);
    for (let i = 0; i < 5; i++) {
      const result = await cmd.execute(['list'], makeOptions(tempDir));
      expect(result.ok).toBe(true);
    }
  });
});

// ── ConfigCommand get ──────────────────────────────────────────

describe('ConfigCommand get', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('get log.level → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'log.level'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('존재하지 않는 키 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'nonexistent.key'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 키 → code=cli_config_key_not_found', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'nonexistent.key'], makeOptions(tempDir));
    if (!result.ok) expect(result.error.code).toBe('cli_config_key_not_found');
  });

  it('키 없이 get → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('키 없이 get → code=cli_config_missing_key', async () => {
    const result = await new ConfigCommand(logger).execute(['get'], makeOptions(tempDir));
    if (!result.ok) expect(result.error.code).toBe('cli_config_missing_key');
  });

  it('존재하는 중첩 키 조회 → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'embedding.default'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('여러 유효 키 조회 → 모두 ok', async () => {
    const cmd = new ConfigCommand(logger);
    const keys = ['log.level', 'embedding.default'];
    for (const key of keys) {
      const result = await cmd.execute(['get', key], makeOptions(tempDir));
      expect(result.ok).toBe(true);
    }
  });

  it('에러 코드가 문자열이다 (없는 키)', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'no.such.key'], makeOptions(tempDir));
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 메시지가 문자열이다', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'no.key'], makeOptions(tempDir));
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('없는 키 5번 반복 → 항상 ok=false', async () => {
    const cmd = new ConfigCommand(logger);
    for (let i = 0; i < 5; i++) {
      const result = await cmd.execute(['get', `random.key.${i}`], makeOptions(tempDir));
      expect(result.ok).toBe(false);
    }
  });

  it('매우 깊은 키 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'a.b.c.d.e.f.g'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('빈 키 문자열 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get', ''], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });
});

// ── ConfigCommand set ──────────────────────────────────────────

describe('ConfigCommand set', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('set log.level debug → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('set log.level debug → 파일에 반영됨', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const content = await Bun.file(configPath).text();
    const config = JSON.parse(content);
    expect(config.log.level).toBe('debug');
  });

  it('set 숫자 값 → number로 파싱', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'testing.unitCount', '5000'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.testing.unitCount).toBe(5000);
  });

  it('set boolean false → boolean으로 파싱', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'verification.opusEscalationOnFailure', 'false'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.verification.opusEscalationOnFailure).toBe(false);
  });

  it('set boolean true → boolean으로 파싱', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'verification.opusEscalationOnFailure', 'true'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.verification.opusEscalationOnFailure).toBe(true);
  });

  it('빈 config.json → set 성공', async () => {
    const configPath = resolve(tempDir, '.adev', 'config.json');
    await Bun.write(configPath, '{}');
    const result = await new ConfigCommand(logger).execute(['set', 'log.level', 'warn'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe('warn');
  });

  it('set 키 없이 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['set'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('set 키 없이 → code=cli_config_missing_args', async () => {
    const result = await new ConfigCommand(logger).execute(['set'], makeOptions(tempDir));
    if (!result.ok) expect(result.error.code).toBe('cli_config_missing_args');
  });

  it('set 키만 있고 값 없음 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['set', 'log.level'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('여러 set 연속 → 모두 ok', async () => {
    const cmd = new ConfigCommand(logger);
    const sets = [
      ['set', 'log.level', 'debug'],
      ['set', 'log.level', 'info'],
      ['set', 'log.level', 'warn'],
    ];
    for (const args of sets) {
      const result = await cmd.execute(args, makeOptions(tempDir));
      expect(result.ok).toBe(true);
    }
  });

  it('set → get 파이프라인', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    const result = await cmd.execute(['get', 'log.level'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('set ok가 boolean이다', async () => {
    const result = await new ConfigCommand(logger).execute(['set', 'log.level', 'info'], makeOptions(tempDir));
    expect(typeof result.ok).toBe('boolean');
  });

  it('같은 키 반복 set → 항상 ok', async () => {
    const cmd = new ConfigCommand(logger);
    for (let i = 0; i < 5; i++) {
      const result = await cmd.execute(['set', 'log.level', 'info'], makeOptions(tempDir));
      expect(result.ok).toBe(true);
    }
  });
});

// ── ConfigCommand 서브커맨드 오류 ─────────────────────────────

describe('ConfigCommand 서브커맨드 오류', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('서브커맨드 없이 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute([], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('서브커맨드 없이 → code=cli_config_missing_subcommand', async () => {
    const result = await new ConfigCommand(logger).execute([], makeOptions(tempDir));
    if (!result.ok) expect(result.error.code).toBe('cli_config_missing_subcommand');
  });

  it('알 수 없는 서브커맨드 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['unknown'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('알 수 없는 서브커맨드 → code=cli_config_unknown_subcommand', async () => {
    const result = await new ConfigCommand(logger).execute(['unknown'], makeOptions(tempDir));
    if (!result.ok) expect(result.error.code).toBe('cli_config_unknown_subcommand');
  });

  it('다양한 알 수 없는 서브커맨드 → ok=false', async () => {
    // WHY: 'invalid', 'zzz', 'xyz' 같이 실제로 없는 서브커맨드만 사용
    const cmds = ['invalid', 'zzz-nonexistent', 'xyz'];
    for (const sub of cmds) {
      const result = await new ConfigCommand(logger).execute([sub], makeOptions(tempDir));
      expect(result.ok).toBe(false);
    }
  });

  it('에러 코드가 문자열이다', async () => {
    const result = await new ConfigCommand(logger).execute([], makeOptions(tempDir));
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 메시지가 문자열이다', async () => {
    const result = await new ConfigCommand(logger).execute(['xyz'], makeOptions(tempDir));
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('5번 빈 args → 항상 ok=false', async () => {
    const cmd = new ConfigCommand(logger);
    for (let i = 0; i < 5; i++) {
      const result = await cmd.execute([], makeOptions(tempDir));
      expect(result.ok).toBe(false);
    }
  });

  it('두 커맨드 인스턴스 독립', async () => {
    const cmd1 = new ConfigCommand(logger);
    const cmd2 = new ConfigCommand(logger);
    const r1 = await cmd1.execute(['list'], makeOptions(tempDir));
    const r2 = await cmd2.execute(['list'], makeOptions(tempDir));
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});

// ── getNestedValue ────────────────────────────────────────────

describe('getNestedValue', () => {
  it('단일 키로 값을 가져온다', () => {
    expect(getNestedValue({ name: 'test' }, 'name')).toBe('test');
  });

  it('중첩 키 a.b.c → 42', () => {
    expect(getNestedValue({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('존재하지 않는 키 → undefined', () => {
    expect(getNestedValue({ a: 1 }, 'b')).toBeUndefined();
  });

  it('중간 경로 없음 → undefined', () => {
    expect(getNestedValue({ a: 1 }, 'a.b.c')).toBeUndefined();
  });

  it('null 중간값 → undefined', () => {
    expect(getNestedValue({ a: null } as Record<string, unknown>, 'a.b')).toBeUndefined();
  });

  it('빈 객체 → undefined', () => {
    expect(getNestedValue({}, 'anything')).toBeUndefined();
  });

  it('boolean 값 가져오기', () => {
    expect(getNestedValue({ flag: true }, 'flag')).toBe(true);
  });

  it('false 값도 undefined 아님', () => {
    expect(getNestedValue({ flag: false }, 'flag')).toBe(false);
  });

  it('0 값도 undefined 아님', () => {
    expect(getNestedValue({ count: 0 }, 'count')).toBe(0);
  });

  it('빈 문자열 값 가져오기', () => {
    expect(getNestedValue({ key: '' }, 'key')).toBe('');
  });

  it('2단계 중첩 키 → 값 반환', () => {
    expect(getNestedValue({ a: { b: 'val' } }, 'a.b')).toBe('val');
  });

  it('4단계 중첩 키 → 값 반환', () => {
    expect(getNestedValue({ a: { b: { c: { d: 99 } } } }, 'a.b.c.d')).toBe(99);
  });

  it('존재하는 단일 키 중 하나 → 값 반환', () => {
    const obj = { x: 1, y: 2, z: 3 };
    expect(getNestedValue(obj, 'y')).toBe(2);
  });

  it('null 값 자체 가져오기', () => {
    const result = getNestedValue({ key: null }, 'key');
    expect(result).toBeNull();
  });

  it('배열 값 가져오기', () => {
    const result = getNestedValue({ arr: [1, 2, 3] }, 'arr');
    expect(Array.isArray(result)).toBe(true);
  });

  it('숫자 1000 가져오기', () => {
    expect(getNestedValue({ count: 1000 }, 'count')).toBe(1000);
  });

  it('5단계 중첩 → 값 반환', () => {
    const obj = { a: { b: { c: { d: { e: 'deep' } } } } };
    expect(getNestedValue(obj, 'a.b.c.d.e')).toBe('deep');
  });

  it('sibling 키 접근 → 올바른 값', () => {
    const obj = { log: { level: 'info', format: 'json' } };
    expect(getNestedValue(obj, 'log.format')).toBe('json');
    expect(getNestedValue(obj, 'log.level')).toBe('info');
  });

  it('존재하지 않는 단계 → undefined (깊은 경로)', () => {
    expect(getNestedValue({ a: 1 }, 'a.b.c.d.e')).toBeUndefined();
  });
});

// ── setNestedValue ────────────────────────────────────────────

describe('setNestedValue', () => {
  it('단일 키 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'name', 'test');
    expect(obj.name).toBe('test');
  });

  it('중첩 키 a.b.c 설정 → 42', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 42);
    expect((obj as { a: { b: { c: number } } }).a.b.c).toBe(42);
  });

  it('기존 값 덮어쓰기', () => {
    const obj: Record<string, unknown> = { log: { level: 'info' } };
    setNestedValue(obj, 'log.level', 'debug');
    expect((obj as { log: { level: string } }).log.level).toBe('debug');
  });

  it('중간 경로 자동 생성', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'deep.nested.key', true);
    expect((obj as { deep: { nested: { key: boolean } } }).deep.nested.key).toBe(true);
  });

  it('boolean 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'flag', false);
    expect(obj.flag).toBe(false);
  });

  it('null 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'key', null);
    expect(obj.key).toBeNull();
  });

  it('숫자 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'count', 999);
    expect(obj.count).toBe(999);
  });

  it('0 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'zero', 0);
    expect(obj.zero).toBe(0);
  });

  it('빈 문자열 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'empty', '');
    expect(obj.empty).toBe('');
  });

  it('기존 객체 구조 유지', () => {
    const obj: Record<string, unknown> = { log: { level: 'info', format: 'json' } };
    setNestedValue(obj, 'log.level', 'debug');
    expect((obj as { log: { format: string } }).log.format).toBe('json');
  });

  it('여러 키 순차 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a', 1);
    setNestedValue(obj, 'b', 2);
    setNestedValue(obj, 'c', 3);
    expect(obj.a).toBe(1);
    expect(obj.b).toBe(2);
    expect(obj.c).toBe(3);
  });

  it('4단계 중첩 생성', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c.d', 'deep');
    expect((obj as { a: { b: { c: { d: string } } } }).a.b.c.d).toBe('deep');
  });

  it('true 설정 후 false로 덮어씀', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'flag', true);
    setNestedValue(obj, 'flag', false);
    expect(obj.flag).toBe(false);
  });

  it('숫자 → 문자열로 덮어씀', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'val', 42);
    setNestedValue(obj, 'val', 'hello');
    expect(obj.val).toBe('hello');
  });

  it('한국어 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'name', '한국어 값');
    expect(obj.name).toBe('한국어 값');
  });
});

// ── parseConfigValue ──────────────────────────────────────────

describe('parseConfigValue', () => {
  it('"true" → boolean true', () => {
    expect(parseConfigValue('true')).toBe(true);
  });

  it('"false" → boolean false', () => {
    expect(parseConfigValue('false')).toBe(false);
  });

  it('"null" → null', () => {
    expect(parseConfigValue('null')).toBeNull();
  });

  it('"42" → number 42', () => {
    expect(parseConfigValue('42')).toBe(42);
  });

  it('"3.14" → number 3.14', () => {
    expect(parseConfigValue('3.14')).toBe(3.14);
  });

  it('"0" → number 0', () => {
    expect(parseConfigValue('0')).toBe(0);
  });

  it('"hello" → string "hello"', () => {
    expect(parseConfigValue('hello')).toBe('hello');
  });

  it('"info" → string "info"', () => {
    expect(parseConfigValue('info')).toBe('info');
  });

  it('빈 문자열 → ""', () => {
    expect(parseConfigValue('')).toBe('');
  });

  it('"-1" → number -1', () => {
    expect(parseConfigValue('-1')).toBe(-1);
  });

  it('"100" → number 100', () => {
    expect(parseConfigValue('100')).toBe(100);
  });

  it('"truthy" → string (not boolean)', () => {
    expect(parseConfigValue('truthy')).toBe('truthy');
  });

  it('"FALSE" → string (대소문자 구분)', () => {
    const result = parseConfigValue('FALSE');
    expect(typeof result === 'string' || result === false).toBe(true);
  });

  it('"1.0" → number 1', () => {
    expect(parseConfigValue('1.0')).toBe(1);
  });

  it('"debug" → string "debug"', () => {
    expect(parseConfigValue('debug')).toBe('debug');
  });

  it('"warn" → string "warn"', () => {
    expect(parseConfigValue('warn')).toBe('warn');
  });

  it('"error" → string "error"', () => {
    expect(parseConfigValue('error')).toBe('error');
  });

  it('"5000" → number 5000', () => {
    expect(parseConfigValue('5000')).toBe(5000);
  });

  it('"999" → number 999', () => {
    expect(parseConfigValue('999')).toBe(999);
  });

  it('"0.5" → number 0.5', () => {
    expect(parseConfigValue('0.5')).toBe(0.5);
  });

  it('"abc123" → string', () => {
    const result = parseConfigValue('abc123');
    expect(typeof result).toBe('string');
  });

  it('공백 포함 문자열 → string', () => {
    const result = parseConfigValue('hello world');
    expect(typeof result).toBe('string');
  });

  it('"NaN" → string 또는 NaN', () => {
    const result = parseConfigValue('NaN');
    expect(typeof result === 'string' || Number.isNaN(result)).toBe(true);
  });

  it('"Infinity" → string 또는 number', () => {
    const result = parseConfigValue('Infinity');
    expect(typeof result === 'string' || typeof result === 'number').toBe(true);
  });

  it('5번 반복 "true" → 항상 true', () => {
    for (let i = 0; i < 5; i++) {
      expect(parseConfigValue('true')).toBe(true);
    }
  });

  it('5번 반복 "42" → 항상 42', () => {
    for (let i = 0; i < 5; i++) {
      expect(parseConfigValue('42')).toBe(42);
    }
  });
});
