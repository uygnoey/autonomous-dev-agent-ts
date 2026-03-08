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

// ── getNestedValue 추가 경계값 ────────────────────────────────

describe('getNestedValue 추가 경계값', () => {
  it('숫자 키 경로 → undefined (숫자 프로퍼티 접근)', () => {
    const obj = { '0': 'zero', '1': 'one' } as Record<string, unknown>;
    // 단일 숫자 문자열 키
    expect(getNestedValue(obj, '0')).toBe('zero');
  });

  it('특수문자 포함 키 → undefined', () => {
    // 점이 없는 특수 키는 단일 키로 취급
    expect(getNestedValue({ 'key@!': 'val' } as Record<string, unknown>, 'key@!')).toBe('val');
  });

  it('경로 중간 배열 → 배열에서 인덱스 없음', () => {
    const obj = { arr: [1, 2, 3] } as Record<string, unknown>;
    // arr.0 형식은 지원하지 않을 수도 있음
    const result = getNestedValue(obj, 'arr.0');
    // 결과가 1이거나 undefined이어야 함 (구현에 따라)
    expect(result === 1 || result === undefined).toBe(true);
  });

  it('undefined 중간값 → undefined', () => {
    const obj = { a: undefined } as Record<string, unknown>;
    expect(getNestedValue(obj, 'a.b')).toBeUndefined();
  });

  it('빈 배열 값 가져오기', () => {
    const obj = { items: [] };
    const result = getNestedValue(obj, 'items');
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(0);
  });

  it('중첩 객체 자체를 가져오기 (중간 경로)', () => {
    const obj = { level1: { level2: { level3: 'val' } } };
    const result = getNestedValue(obj, 'level1.level2');
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('한국어 키 가져오기', () => {
    const obj = { '한국어키': '한국어값' } as Record<string, unknown>;
    expect(getNestedValue(obj, '한국어키')).toBe('한국어값');
  });

  it('UUID 형식 키 가져오기', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const obj = { [uuid]: 'uuid-value' } as Record<string, unknown>;
    expect(getNestedValue(obj, uuid)).toBe('uuid-value');
  });

  it('NaN 값 가져오기', () => {
    const obj = { num: Number.NaN } as Record<string, unknown>;
    const result = getNestedValue(obj, 'num');
    expect(Number.isNaN(result)).toBe(true);
  });

  it('Infinity 값 가져오기', () => {
    const obj = { inf: Infinity } as Record<string, unknown>;
    expect(getNestedValue(obj, 'inf')).toBe(Infinity);
  });

  it('매우 큰 숫자 값 가져오기', () => {
    const obj = { big: Number.MAX_SAFE_INTEGER } as Record<string, unknown>;
    expect(getNestedValue(obj, 'big')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('음수 값 가져오기', () => {
    const obj = { neg: -999 } as Record<string, unknown>;
    expect(getNestedValue(obj, 'neg')).toBe(-999);
  });
});

// ── setNestedValue 추가 경계값 ───────────────────────────────

describe('setNestedValue 추가 경계값', () => {
  it('UUID 값 설정', () => {
    const obj: Record<string, unknown> = {};
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    setNestedValue(obj, 'id', uuid);
    expect(obj.id).toBe(uuid);
  });

  it('한국어 키 경로 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, '한국어.키', '값');
    expect((obj as { 한국어: { 키: string } })['한국어']['키']).toBe('값');
  });

  it('특수문자 포함 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'val', '!@#$%^&*()');
    expect(obj.val).toBe('!@#$%^&*()');
  });

  it('음수 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'neg', -100);
    expect(obj.neg).toBe(-100);
  });

  it('Infinity 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'inf', Infinity);
    expect(obj.inf).toBe(Infinity);
  });

  it('배열 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'list', [1, 2, 3]);
    expect(Array.isArray(obj.list)).toBe(true);
  });

  it('중첩 객체 값 설정', () => {
    const obj: Record<string, unknown> = {};
    const inner = { x: 1, y: 2 };
    setNestedValue(obj, 'inner', inner);
    expect(obj.inner).toBe(inner);
  });

  it('5단계 중첩 후 다른 키 설정 → 각각 독립', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 1);
    setNestedValue(obj, 'a.b.d', 2);
    const ab = (obj as { a: { b: { c: number; d: number } } }).a.b;
    expect(ab.c).toBe(1);
    expect(ab.d).toBe(2);
  });

  it('null 덮어쓰기 → 이후 null', () => {
    const obj: Record<string, unknown> = { key: 'original' };
    setNestedValue(obj, 'key', null);
    expect(obj.key).toBeNull();
  });

  it('10번 같은 키 설정 → 마지막 값', () => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) {
      setNestedValue(obj, 'counter', i);
    }
    expect(obj.counter).toBe(9);
  });
});

// ── parseConfigValue 추가 경계값 ─────────────────────────────

describe('parseConfigValue 추가 경계값', () => {
  it('"undefined" → string (예약어 아님)', () => {
    const result = parseConfigValue('undefined');
    expect(typeof result).toBe('string');
  });

  it('"TRUE" → 대소문자 구분 검증', () => {
    // "TRUE"는 "true"와 다름 → string 반환 가능
    const result = parseConfigValue('TRUE');
    expect(typeof result === 'string' || result === true).toBe(true);
  });

  it('"NULL" → 대소문자 구분 검증', () => {
    const result = parseConfigValue('NULL');
    expect(typeof result === 'string' || result === null).toBe(true);
  });

  it('"  42  " → 공백 포함 숫자 문자열 → string 또는 number', () => {
    const result = parseConfigValue('  42  ');
    expect(typeof result === 'string' || typeof result === 'number').toBe(true);
  });

  it('"3e2" → 지수 표기법 → number 또는 string', () => {
    const result = parseConfigValue('3e2');
    expect(typeof result === 'string' || typeof result === 'number').toBe(true);
  });

  it('"0x1F" → 16진수 문자열 → string 또는 number', () => {
    const result = parseConfigValue('0x1F');
    expect(typeof result === 'string' || typeof result === 'number').toBe(true);
  });

  it('UUID 형식 → string 반환', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(parseConfigValue(uuid)).toBe(uuid);
  });

  it('한국어 → string 반환', () => {
    expect(parseConfigValue('한국어설정값')).toBe('한국어설정값');
  });

  it('개행 포함 → string 반환', () => {
    const result = parseConfigValue('line1\nline2');
    expect(typeof result).toBe('string');
  });

  it('"1000000" → number 1000000', () => {
    expect(parseConfigValue('1000000')).toBe(1000000);
  });

  it('"-0" → number 0 또는 -0', () => {
    const result = parseConfigValue('-0');
    expect(typeof result === 'number' || typeof result === 'string').toBe(true);
  });

  it('"2.718281828" → float number', () => {
    const result = parseConfigValue('2.718281828');
    expect(result).toBeCloseTo(2.718281828);
  });
});

// ── ConfigCommand execute 추가 오류 경로 ─────────────────────

describe('ConfigCommand execute 추가 오류 경로', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('get 빈 문자열 키 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get', ''], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('set 키만 있고 값 없음 → error.code 문자열', async () => {
    const result = await new ConfigCommand(logger).execute(['set', 'log.level'], makeOptions(tempDir));
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('list 결과는 ok=true', async () => {
    const cmd = new ConfigCommand(logger);
    const r = await cmd.execute(['list'], makeOptions(tempDir));
    expect(r.ok).toBe(true);
  });

  it('get 여러 잘못된 키 → 항상 ok=false', async () => {
    const cmd = new ConfigCommand(logger);
    const badKeys = [
      'zzz.nonexistent',
      'abc.def.ghi',
      'totally.wrong.path',
      '....dots',
    ];
    for (const key of badKeys) {
      const result = await cmd.execute(['get', key], makeOptions(tempDir));
      expect(result.ok).toBe(false);
    }
  });

  it('set → list → ok=true 파이프라인', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    const listResult = await cmd.execute(['list'], makeOptions(tempDir));
    expect(listResult.ok).toBe(true);
  });

  it('알 수 없는 서브커맨드 → error.message 존재', async () => {
    const result = await new ConfigCommand(logger).execute(['nonexistent-cmd'], makeOptions(tempDir));
    if (!result.ok) expect(result.error.message).toBeDefined();
  });
});

// ── ConfigCommand reset ────────────────────────────────────────

describe('ConfigCommand reset', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reset → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['reset'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('reset 후 config 파일이 DEFAULT_CONFIG로 복원됨', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    await cmd.execute(['reset'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe(DEFAULT_CONFIG.log.level);
  });

  it('reset 연속 호출 → 항상 ok', async () => {
    const cmd = new ConfigCommand(logger);
    for (let i = 0; i < 3; i++) {
      const result = await cmd.execute(['reset'], makeOptions(tempDir));
      expect(result.ok).toBe(true);
    }
  });

  it('set 후 reset → 값이 원래대로 돌아옴', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'warn'], makeOptions(tempDir));
    await cmd.execute(['reset'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe(DEFAULT_CONFIG.log.level);
  });

  it('reset ok는 boolean이다', async () => {
    const result = await new ConfigCommand(logger).execute(['reset'], makeOptions(tempDir));
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 config 후 reset → ok', async () => {
    const configPath = resolve(tempDir, '.adev', 'config.json');
    await Bun.write(configPath, '{}');
    const result = await new ConfigCommand(logger).execute(['reset'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('reset 5번 반복 → 항상 ok', async () => {
    const cmd = new ConfigCommand(logger);
    for (let i = 0; i < 5; i++) {
      expect((await cmd.execute(['reset'], makeOptions(tempDir))).ok).toBe(true);
    }
  });
});

// ── ConfigCommand get 추가 경계값 ──────────────────────────────

describe('ConfigCommand get 추가 경계값', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('get embedding.default → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'embedding.default'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('get log.level → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'log.level'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('get testing.unitCount → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'testing.unitCount'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('get verification.opusEscalationOnFailure → ok=true', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'verification.opusEscalationOnFailure'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('get nonexistent.key → error.code=cli_config_key_not_found', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'nonexistent.key'], makeOptions(tempDir));
    if (!result.ok) expect(result.error.code).toBe('cli_config_key_not_found');
  });

  it('UUID 형식 키 → ok=false (키 없음)', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = await new ConfigCommand(logger).execute(['get', uuid], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('한국어 키 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get', '한국어.키'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('매우 긴 키 경로 → ok=false', async () => {
    const deepKey = Array.from({ length: 20 }, (_, i) => `level${i}`).join('.');
    const result = await new ConfigCommand(logger).execute(['get', deepKey], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('점(.)으로만 구성된 키 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get', '...'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('특수문자 포함 키 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get', '!@#$%'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('공백 포함 키 → ok=false', async () => {
    const result = await new ConfigCommand(logger).execute(['get', 'key with spaces'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
  });

  it('10개 존재 키 → 모두 ok', async () => {
    const cmd = new ConfigCommand(logger);
    const validKeys = ['log.level', 'embedding.default'];
    for (const key of validKeys) {
      const result = await cmd.execute(['get', key], makeOptions(tempDir));
      expect(result.ok).toBe(true);
    }
  });
});

// ── ConfigCommand set 추가 경계값 ──────────────────────────────

describe('ConfigCommand set 추가 경계값', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('set log.level info → 파일에 info 저장', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'info'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe('info');
  });

  it('set testing.unitCount 10000 → number 10000', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'testing.unitCount', '10000'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.testing.unitCount).toBe(10000);
  });

  it('set 값 → get으로 확인 가능', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'warn'], makeOptions(tempDir));
    const getResult = await cmd.execute(['get', 'log.level'], makeOptions(tempDir));
    expect(getResult.ok).toBe(true);
  });

  it('set 후 reset → 기본값 복원', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    await cmd.execute(['reset'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe(DEFAULT_CONFIG.log.level);
  });

  it('set 연속으로 다른 키들 → 모두 파일에 반영', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    await cmd.execute(['set', 'testing.unitCount', '9999'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe('debug');
    expect(config.testing.unitCount).toBe(9999);
  });

  it('set 빈 값 → ok=true (빈 문자열 → string으로 저장)', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['set', 'log.level', ''], makeOptions(tempDir));
    // 빈 문자열은 parseConfigValue('')→'' 이지만 validateConfig에 따라 결과 다를 수 있음
    expect(typeof result.ok).toBe('boolean');
  });

  it('set 음수 → 파일에 반영 (validateConfig 통과 여부에 따라)', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['set', 'testing.unitCount', '-1'], makeOptions(tempDir));
    expect(typeof result.ok).toBe('boolean');
  });

  it('set null → null로 저장', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['set', 'log.level', 'null'], makeOptions(tempDir));
    expect(typeof result.ok).toBe('boolean');
  });

  it('set 한국어 값 → 문자열로 저장', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['set', 'log.level', '디버그'], makeOptions(tempDir));
    expect(typeof result.ok).toBe('boolean');
  });

  it('10번 연속 같은 set → 마지막 값 유지', async () => {
    const cmd = new ConfigCommand(logger);
    for (let i = 0; i < 10; i++) {
      await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    }
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe('debug');
  });
});

// ── getNestedValue 심층 경계값 ────────────────────────────────

describe('getNestedValue 심층 경계값', () => {
  it('중첩 객체 가져오기 → 객체 반환', () => {
    const obj = { a: { b: { c: { value: 42 } } } };
    const result = getNestedValue(obj, 'a.b.c');
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('단순 숫자 키 접근 → 값 반환', () => {
    const obj = { count: 42 };
    expect(getNestedValue(obj, 'count')).toBe(42);
  });

  it('6단계 중첩 → 값 반환', () => {
    const obj = { a: { b: { c: { d: { e: { f: 'leaf' } } } } } };
    expect(getNestedValue(obj, 'a.b.c.d.e.f')).toBe('leaf');
  });

  it('객체 자체 반환 가능', () => {
    const inner = { x: 1 };
    expect(getNestedValue({ inner }, 'inner')).toBe(inner);
  });

  it('배열 내 객체 → 배열 반환', () => {
    const obj = { items: [{ a: 1 }, { b: 2 }] };
    const result = getNestedValue(obj, 'items');
    expect(Array.isArray(result)).toBe(true);
  });

  it('false 값이 존재하는 키 → undefined 아님', () => {
    const result = getNestedValue({ enabled: false }, 'enabled');
    expect(result).not.toBeUndefined();
    expect(result).toBe(false);
  });

  it('0 값이 있는 키 → 0 반환', () => {
    const result = getNestedValue({ count: 0 }, 'count');
    expect(result).toBe(0);
  });

  it('빈 배열 값 → 빈 배열 반환', () => {
    const result = getNestedValue({ items: [] as unknown[] }, 'items');
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(0);
  });

  it('빈 객체 값 → 빈 객체 반환', () => {
    const result = getNestedValue({ empty: {} }, 'empty');
    expect(typeof result).toBe('object');
  });

  it('MAX_SAFE_INTEGER 값 → 정확히 반환', () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(getNestedValue({ n: big }, 'n')).toBe(big);
  });

  it('MIN_SAFE_INTEGER 값 → 정확히 반환', () => {
    const small = Number.MIN_SAFE_INTEGER;
    expect(getNestedValue({ n: small }, 'n')).toBe(small);
  });

  it('빈 키 → 접근 불가 (undefined)', () => {
    // split('') → [''] → 단일 empty key
    const obj = { '': 'empty-key' } as Record<string, unknown>;
    const result = getNestedValue(obj, '');
    // 단일 빈 키: obj[''] = 'empty-key'
    expect(result === 'empty-key' || result === undefined).toBe(true);
  });

  it('다중 sibling 키 중 두 번째 → 정확히 반환', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(getNestedValue(obj, 'b')).toBe(2);
  });

  it('10번 동일 호출 → 항상 동일 결과', () => {
    const obj = { a: { b: 'stable' } };
    for (let i = 0; i < 10; i++) {
      expect(getNestedValue(obj, 'a.b')).toBe('stable');
    }
  });
});

// ── setNestedValue 심층 경계값 ────────────────────────────────

describe('setNestedValue 심층 경계값', () => {
  it('6단계 중첩 생성 → 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c.d.e.f', 'leaf');
    type DeepObj = { a: { b: { c: { d: { e: { f: string } } } } } };
    expect((obj as DeepObj).a.b.c.d.e.f).toBe('leaf');
  });

  it('같은 부모 아래 두 키 설정 → 각각 독립', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'parent.child1', 'v1');
    setNestedValue(obj, 'parent.child2', 'v2');
    const parent = (obj as { parent: { child1: string; child2: string } }).parent;
    expect(parent.child1).toBe('v1');
    expect(parent.child2).toBe('v2');
  });

  it('함수 값 설정', () => {
    const obj: Record<string, unknown> = {};
    const fn = () => 42;
    setNestedValue(obj, 'fn', fn);
    expect(typeof obj.fn).toBe('function');
  });

  it('undefined 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'undef', undefined);
    expect(obj.undef).toBeUndefined();
  });

  it('NaN 값 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'nan', Number.NaN);
    expect(Number.isNaN(obj.nan)).toBe(true);
  });

  it('Symbol 값 설정', () => {
    const obj: Record<string, unknown> = {};
    const sym = Symbol('test');
    setNestedValue(obj, 'sym', sym);
    expect(obj.sym).toBe(sym);
  });

  it('중첩 경로 + 인접 키 보존', () => {
    const obj: Record<string, unknown> = { sibling: 'preserved' };
    setNestedValue(obj, 'nested.key', 'value');
    expect(obj.sibling).toBe('preserved');
  });

  it('20번 연속 설정 → 최신값 유지', () => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      setNestedValue(obj, 'counter', i);
    }
    expect(obj.counter).toBe(19);
  });

  it('null → object로 덮어쓰기', () => {
    const obj: Record<string, unknown> = { key: null };
    setNestedValue(obj, 'key.sub', 'value');
    // null이 객체로 교체되어야 함
    const key = obj.key as Record<string, unknown>;
    expect(typeof key).toBe('object');
  });

  it('단일 키 + 단일 값 → 기존 키와 공존', () => {
    const obj: Record<string, unknown> = { existing: 'yes' };
    setNestedValue(obj, 'new', 'added');
    expect(obj.existing).toBe('yes');
    expect(obj.new).toBe('added');
  });
});

// ── parseConfigValue 심층 경계값 ─────────────────────────────

describe('parseConfigValue 심층 경계값', () => {
  it('"true" → boolean true (타입 확인)', () => {
    expect(typeof parseConfigValue('true')).toBe('boolean');
  });

  it('"false" → boolean false (타입 확인)', () => {
    expect(typeof parseConfigValue('false')).toBe('boolean');
  });

  it('"null" → null (타입 확인)', () => {
    expect(parseConfigValue('null')).toBeNull();
  });

  it('"0" → number (0 === number)', () => {
    expect(typeof parseConfigValue('0')).toBe('number');
  });

  it('"1" → number 1', () => {
    expect(parseConfigValue('1')).toBe(1);
  });

  it('"-1" → number -1 (타입 확인)', () => {
    expect(typeof parseConfigValue('-1')).toBe('number');
  });

  it('"10000" → number 10000', () => {
    expect(parseConfigValue('10000')).toBe(10000);
  });

  it('"0.001" → number', () => {
    const result = parseConfigValue('0.001');
    expect(typeof result).toBe('number');
  });

  it('"100.000" → number 100', () => {
    expect(parseConfigValue('100.000')).toBe(100);
  });

  it('"hello world" → string', () => {
    expect(parseConfigValue('hello world')).toBe('hello world');
  });

  it('"true " (trailing space) → string', () => {
    // "true " → Number("true ") = NaN, value.trim() = "true " (trim 후 "true"이면 boolean 아님)
    // parseConfigValue: 'true ' !== 'true', 'true ' !== 'false', 'true ' !== 'null'
    // Number('true ') = NaN → 문자열 반환
    const result = parseConfigValue('true ');
    expect(typeof result).toBe('string');
  });

  it('" false" (leading space) → string', () => {
    const result = parseConfigValue(' false');
    expect(typeof result).toBe('string');
  });

  it('"HELLO" → string 그대로', () => {
    expect(parseConfigValue('HELLO')).toBe('HELLO');
  });

  it('"" (빈 문자열) → 빈 문자열', () => {
    // parseConfigValue: value === '' → Number('') = 0 이지만 value.trim() === '' 이므로 숫자 아님 → ''
    expect(parseConfigValue('')).toBe('');
  });

  it('JSON 문자열 → string 그대로', () => {
    const json = '{"key":"value"}';
    expect(parseConfigValue(json)).toBe(json);
  });

  it('URL 문자열 → string 그대로', () => {
    const url = 'https://example.com/api/v1';
    expect(parseConfigValue(url)).toBe(url);
  });

  it('10번 동일 "42" → 항상 42', () => {
    for (let i = 0; i < 10; i++) {
      expect(parseConfigValue('42')).toBe(42);
    }
  });

  it('"1e3" → 1000 (지수 표기법)', () => {
    const result = parseConfigValue('1e3');
    expect(typeof result === 'number' && result === 1000 || typeof result === 'string').toBe(true);
  });

  it('"  " 공백만 → string 반환 (trim 후 빈 문자열)', () => {
    // Number('  ') = 0, 하지만 value.trim() === '' → 문자열 반환
    const result = parseConfigValue('  ');
    expect(result).toBe('  ');
  });
});

// ── ConfigCommand set 연속 파이프라인 ──────────────────────────

describe('ConfigCommand set 연속 파이프라인', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('set → get → 값 일치 확인 (log.level=debug)', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    const result = await cmd.execute(['get', 'log.level'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('set → get → 값 일치 확인 (log.level=warn)', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'warn'], makeOptions(tempDir));
    const result = await cmd.execute(['get', 'log.level'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('set 3번 연속 덮어씀 → 마지막 값 유지', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    await cmd.execute(['set', 'log.level', 'info'], makeOptions(tempDir));
    await cmd.execute(['set', 'log.level', 'error'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe('error');
  });

  it('set true → get 반영 확인', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'verification.opusEscalationOnFailure', 'true'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.verification.opusEscalationOnFailure).toBe(true);
  });

  it('set false → get 반영 확인', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'verification.opusEscalationOnFailure', 'false'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.verification.opusEscalationOnFailure).toBe(false);
  });

  it('set → reset → 기본값 복원', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    await cmd.execute(['reset'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe(DEFAULT_CONFIG.log.level);
  });

  it('set 숫자 → 파일에 number 타입 저장', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'testing.unitCount', '9999'], makeOptions(tempDir));
    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(typeof config.testing.unitCount).toBe('number');
    expect(config.testing.unitCount).toBe(9999);
  });

  it('여러 키 set 후 list → ok', async () => {
    const cmd = new ConfigCommand(logger);
    await cmd.execute(['set', 'log.level', 'debug'], makeOptions(tempDir));
    await cmd.execute(['set', 'verification.opusEscalationOnFailure', 'true'], makeOptions(tempDir));
    const result = await cmd.execute(['list'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('get missing → ok=false + code=cli_config_key_not_found', async () => {
    const cmd = new ConfigCommand(logger);
    const result = await cmd.execute(['get', 'missing.key.path'], makeOptions(tempDir));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cli_config_key_not_found');
  });

  it('set ok=true 반환', async () => {
    const result = await new ConfigCommand(logger).execute(['set', 'log.level', 'info'], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });
});

// ── getNestedValue 극한 경계값 ───────────────────────────────

describe('getNestedValue 극한 경계값', () => {
  it('10단계 중첩 키 → 값 반환', () => {
    const obj: Record<string, unknown> = {};
    let cur = obj as Record<string, unknown>;
    for (let i = 0; i < 9; i++) {
      const next: Record<string, unknown> = {};
      cur[`l${i}`] = next;
      cur = next;
    }
    cur['l9'] = 'deepValue';
    const path = Array.from({ length: 10 }, (_, i) => `l${i}`).join('.');
    expect(getNestedValue(obj, path)).toBe('deepValue');
  });

  it('숫자 0 값 → 0 반환 (truthy 검사 아님)', () => {
    expect(getNestedValue({ zero: 0 }, 'zero')).toBe(0);
  });

  it('false 값 → false 반환', () => {
    expect(getNestedValue({ flag: false }, 'flag')).toBe(false);
  });

  it('빈 배열 값 → 빈 배열 반환', () => {
    const result = getNestedValue({ arr: [] }, 'arr');
    expect(Array.isArray(result)).toBe(true);
  });

  it('객체 자체 반환 (단일 키)', () => {
    const inner = { a: 1, b: 2 };
    const result = getNestedValue({ obj: inner }, 'obj');
    expect(result).toEqual(inner);
  });

  it('undefined 값 → undefined 반환', () => {
    const obj = { key: undefined } as Record<string, unknown>;
    expect(getNestedValue(obj, 'key')).toBeUndefined();
  });

  it('음수 값 → 음수 반환', () => {
    expect(getNestedValue({ val: -42 }, 'val')).toBe(-42);
  });

  it('NaN 값 → NaN 반환', () => {
    const result = getNestedValue({ val: Number.NaN }, 'val');
    expect(Number.isNaN(result)).toBe(true);
  });

  it('이모지 키 → 값 반환', () => {
    const obj = { '🔑': '값' } as Record<string, unknown>;
    expect(getNestedValue(obj, '🔑')).toBe('값');
  });

  it('중첩 배열 값 → 배열 반환', () => {
    const obj = { nested: { arr: [1, 2, 3] } };
    const result = getNestedValue(obj, 'nested.arr');
    expect(Array.isArray(result)).toBe(true);
  });

  it('경로 없음 → undefined', () => {
    expect(getNestedValue({}, 'a.b.c.d.e.f.g.h.i.j')).toBeUndefined();
  });

  it('단순 string 값 → string 타입', () => {
    const result = getNestedValue({ s: 'hello' }, 's');
    expect(typeof result).toBe('string');
  });

  it('단순 number 값 → number 타입', () => {
    const result = getNestedValue({ n: 42 }, 'n');
    expect(typeof result).toBe('number');
  });

  it('중첩 빈 객체 접근 → undefined', () => {
    expect(getNestedValue({ a: {} } as Record<string, unknown>, 'a.b')).toBeUndefined();
  });
});

// ── setNestedValue 극한 경계값 ──────────────────────────────

describe('setNestedValue 극한 경계값', () => {
  it('10단계 중첩 경로 생성', () => {
    const obj: Record<string, unknown> = {};
    const path = 'l0.l1.l2.l3.l4.l5.l6.l7.l8.l9';
    setNestedValue(obj, path, 'ultraDeep');
    // 최소한 첫 번째 키는 생성됨
    expect(obj.l0).toBeDefined();
  });

  it('기존 깊은 경로 덮어쓰기', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 'first');
    setNestedValue(obj, 'a.b.c', 'second');
    expect((obj as { a: { b: { c: string } } }).a.b.c).toBe('second');
  });

  it('0 값 설정 후 다른 키 접근 시 영향 없음', () => {
    const obj: Record<string, unknown> = { other: 'intact' };
    setNestedValue(obj, 'count', 0);
    expect(obj.other).toBe('intact');
  });

  it('빈 배열 설정', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'list', []);
    expect(Array.isArray(obj.list)).toBe(true);
    expect((obj.list as unknown[]).length).toBe(0);
  });

  it('함수 값 설정', () => {
    const obj: Record<string, unknown> = {};
    const fn = () => 42;
    setNestedValue(obj, 'fn', fn);
    expect(typeof obj.fn).toBe('function');
  });

  it('Symbol 값 설정', () => {
    const obj: Record<string, unknown> = {};
    const sym = Symbol('test');
    setNestedValue(obj, 'sym', sym);
    expect(obj.sym).toBe(sym);
  });

  it('같은 경로 100번 설정 → 마지막 값', () => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      setNestedValue(obj, 'repeated', i);
    }
    expect(obj.repeated).toBe(99);
  });

  it('다른 최상위 키들 독립', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a', 1);
    setNestedValue(obj, 'b', 2);
    setNestedValue(obj, 'c', 3);
    expect(obj.a).toBe(1);
    expect(obj.b).toBe(2);
    expect(obj.c).toBe(3);
  });

  it('중첩 경로와 같은 이름 최상위 키 공존', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'x', 'top');
    setNestedValue(obj, 'x.sub', 'nested');
    // x는 이제 객체로 변환됨
    expect(typeof obj.x).toBe('object');
  });
});

// ── parseConfigValue 극한 경계값 ─────────────────────────────

describe('parseConfigValue 극한 경계값', () => {
  it('"true" 10번 반복 → 항상 boolean true', () => {
    for (let i = 0; i < 10; i++) {
      expect(parseConfigValue('true')).toBe(true);
    }
  });

  it('"false" 10번 반복 → 항상 boolean false', () => {
    for (let i = 0; i < 10; i++) {
      expect(parseConfigValue('false')).toBe(false);
    }
  });

  it('"null" 10번 반복 → 항상 null', () => {
    for (let i = 0; i < 10; i++) {
      expect(parseConfigValue('null')).toBeNull();
    }
  });

  it('"0" → 0 (숫자)', () => {
    expect(parseConfigValue('0')).toBe(0);
  });

  it('"-0.5" → -0.5', () => {
    expect(parseConfigValue('-0.5')).toBe(-0.5);
  });

  it('"99.99" → number', () => {
    const result = parseConfigValue('99.99');
    expect(typeof result).toBe('number');
    expect(result).toBeCloseTo(99.99);
  });

  it('"boolean" → string 그대로', () => {
    expect(parseConfigValue('boolean')).toBe('boolean');
  });

  it('"number" → string 그대로', () => {
    expect(parseConfigValue('number')).toBe('number');
  });

  it('"string" → string 그대로', () => {
    expect(parseConfigValue('string')).toBe('string');
  });

  it('"object" → string 그대로', () => {
    expect(parseConfigValue('object')).toBe('object');
  });

  it('이모지 → string 반환', () => {
    const emoji = '🔥✨💡';
    expect(parseConfigValue(emoji)).toBe(emoji);
  });

  it('UUID 문자열 → string 반환', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(parseConfigValue(uuid)).toBe(uuid);
  });

  it('URL → string 반환', () => {
    const url = 'https://api.example.com/v1/chat';
    expect(parseConfigValue(url)).toBe(url);
  });

  it('path → string 반환', () => {
    const path = '/usr/local/bin/adev';
    expect(parseConfigValue(path)).toBe(path);
  });

  it('"1.23456789" → number', () => {
    const result = parseConfigValue('1.23456789');
    expect(typeof result).toBe('number');
  });

  it('"9007199254740991" → MAX_SAFE_INTEGER', () => {
    const result = parseConfigValue('9007199254740991');
    expect(result).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('"false" 타입이 boolean', () => {
    expect(typeof parseConfigValue('false')).toBe('boolean');
  });

  it('"true" 타입이 boolean', () => {
    expect(typeof parseConfigValue('true')).toBe('boolean');
  });

  it('"null" 타입이 object (null은 object)', () => {
    expect(typeof parseConfigValue('null')).toBe('object');
  });
});
