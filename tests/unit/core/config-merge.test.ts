/**
 * config-merge 단위 테스트 / config-merge unit tests
 *
 * @description
 * KR: deepMerge와 validateConfig의 정상/엣지 케이스 검증.
 * EN: Tests for deepMerge and validateConfig including edge cases.
 */

import { describe, expect, it } from 'bun:test';
import { deepMerge, validateConfig } from 'core/config-merge.js';
import { ConfigError } from 'core/errors.js';
import type { ConfigSchema, DeepPartial } from 'core/config-schema.js';

// ── deepMerge ────────────────────────────────────────────────

describe('deepMerge', () => {
  it('override 객체의 스칼라 값이 base를 덮어쓴다', () => {
    const base = { a: 1, b: 'hello' };
    const override = { b: 'world' };

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: 1, b: 'world' });
  });

  it('중첩 객체를 재귀적으로 병합한다', () => {
    const base = { nested: { x: 1, y: 2 }, top: 'keep' };
    const override = { nested: { y: 99, z: 3 } };

    const result = deepMerge(base, override);

    expect(result).toEqual({ nested: { x: 1, y: 99, z: 3 }, top: 'keep' });
  });

  it('3단계 이상 깊이의 중첩 객체도 병합한다', () => {
    const base = { a: { b: { c: { d: 1, e: 2 } } } };
    const override = { a: { b: { c: { e: 99 } } } };

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: { b: { c: { d: 1, e: 99 } } } });
  });

  it('override의 undefined 값은 base 값을 유지한다', () => {
    const base = { a: 1, b: 2 };
    const override = { a: undefined };

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('override의 null 값은 base를 덮어쓴다', () => {
    const base = { a: 1, b: 'keep' } as Record<string, unknown>;
    const override = { a: null };

    const result = deepMerge(base, override);

    expect(result.a).toBeNull();
    expect(result.b).toBe('keep');
  });

  it('배열은 병합하지 않고 override가 대체한다', () => {
    const base = { tags: [1, 2, 3] };
    const override = { tags: [4, 5] };

    const result = deepMerge(base, override);

    expect(result.tags).toEqual([4, 5]);
  });

  it('빈 override 객체는 base를 그대로 반환한다', () => {
    const base = { a: 1, b: { c: 2 } };
    const override = {};

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: 1, b: { c: 2 } });
  });

  it('빈 base에 override를 적용한다', () => {
    const base = {} as Record<string, unknown>;
    const override = { a: 1, b: { c: 2 } };

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: 1, b: { c: 2 } });
  });

  it('양쪽 모두 빈 객체이면 빈 객체를 반환한다', () => {
    const result = deepMerge({}, {});

    expect(result).toEqual({});
  });

  it('base 객체를 변형(mutate)하지 않는다', () => {
    const base = { a: 1, nested: { x: 10 } };
    const override = { a: 2, nested: { x: 20 } };

    deepMerge(base, override);

    expect(base.a).toBe(1);
    expect(base.nested.x).toBe(10);
  });

  it('override가 새 키를 추가한다', () => {
    const base = { existing: 1 };
    const override = { newKey: 'added' };

    const result = deepMerge(base, override);

    expect((result as Record<string, unknown>).newKey).toBe('added');
    expect(result.existing).toBe(1);
  });

  it('base의 객체와 override의 스칼라가 충돌하면 스칼라가 이긴다', () => {
    const base = { a: { nested: true } } as Record<string, unknown>;
    const override = { a: 'scalar' };

    const result = deepMerge(base, override);

    expect(result.a).toBe('scalar');
  });

  it('base의 스칼라와 override의 객체가 충돌하면 객체가 이긴다', () => {
    const base = { a: 'scalar' } as Record<string, unknown>;
    const override = { a: { nested: true } };

    const result = deepMerge(base, override);

    expect(result.a).toEqual({ nested: true });
  });
});

// ── validateConfig ───────────────────────────────────────────

describe('validateConfig', () => {
  it('빈 partial config는 통과한다', () => {
    const result = validateConfig({});

    expect(result.ok).toBe(true);
  });

  it('유효한 log level을 통과시킨다', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      const result = validateConfig({ log: { level } });
      expect(result.ok).toBe(true);
    }
  });

  it('유효하지 않은 log level을 거부한다', () => {
    const result = validateConfig({ log: { level: 'verbose' as 'debug' } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ConfigError);
      expect(result.error.code).toBe('config_invalid_value');
      expect(result.error.message).toContain('log level');
    }
  });

  it('유효한 verification.layer1Model을 통과시킨다', () => {
    for (const model of ['opus', 'sonnet'] as const) {
      const result = validateConfig({ verification: { layer1Model: model } });
      expect(result.ok).toBe(true);
    }
  });

  it('유효하지 않은 verification.layer1Model을 거부한다', () => {
    const result = validateConfig({
      verification: { layer1Model: 'haiku' as 'opus' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ConfigError);
      expect(result.error.code).toBe('config_invalid_value');
    }
  });

  it('유효하지 않은 verification.adevModel을 거부한다', () => {
    const result = validateConfig({
      verification: { adevModel: 'gpt-4' as 'opus' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('config_invalid_value');
    }
  });

  it('testing.unitCount가 0이면 거부한다', () => {
    const result = validateConfig({ testing: { unitCount: 0 } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('unitCount');
    }
  });

  it('testing.unitCount가 음수이면 거부한다', () => {
    const result = validateConfig({ testing: { unitCount: -5 } });

    expect(result.ok).toBe(false);
  });

  it('testing.unitCount가 1이면 통과한다 (경계값)', () => {
    const result = validateConfig({ testing: { unitCount: 1 } });

    expect(result.ok).toBe(true);
  });

  it('testing.e2eTimeoutSeconds가 0이면 거부한다', () => {
    const result = validateConfig({ testing: { e2eTimeoutSeconds: 0 } });

    expect(result.ok).toBe(false);
  });

  it('testing.e2eTimeoutSeconds가 음수이면 거부한다', () => {
    const result = validateConfig({ testing: { e2eTimeoutSeconds: -1 } });

    expect(result.ok).toBe(false);
  });

  it('testing.e2eTimeoutSeconds가 0.001이면 통과한다 (경계값)', () => {
    const result = validateConfig({ testing: { e2eTimeoutSeconds: 0.001 } });

    expect(result.ok).toBe(true);
  });

  it('여러 유효 필드를 동시에 설정해도 통과한다', () => {
    const config: DeepPartial<ConfigSchema> = {
      log: { level: 'debug' },
      verification: { layer1Model: 'sonnet', adevModel: 'opus' },
      testing: { unitCount: 100, e2eTimeoutSeconds: 60 },
    };

    const result = validateConfig(config);

    expect(result.ok).toBe(true);
  });

  it('log.level이 undefined이면 검증을 건너뛴다', () => {
    const result = validateConfig({ log: {} });

    expect(result.ok).toBe(true);
  });
});
