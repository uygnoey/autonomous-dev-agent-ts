/**
 * config-schema 단위 테스트 / config-schema unit tests
 *
 * @description
 * KR: ConfigSchema 기본값, 타입 정합성, 상수값 경계 검증.
 * EN: Tests for ConfigSchema defaults, type consistency, and constant boundaries.
 */

import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_CONFIG,
  DEFAULT_MAX_TOKENS,
  DEFAULT_VERIFIER_MODEL,
} from 'core/config-schema.js';
import type { ConfigSchema, DeepPartial } from 'core/config-schema.js';

// ── 상수 검증 / Constants ────────────────────────────────────

describe('config-schema 상수', () => {
  it('DEFAULT_CLAUDE_MODEL이 claude-opus 모델이다', () => {
    expect(DEFAULT_CLAUDE_MODEL).toContain('claude-opus');
    expect(typeof DEFAULT_CLAUDE_MODEL).toBe('string');
  });

  it('DEFAULT_VERIFIER_MODEL이 claude-haiku 모델이다', () => {
    expect(DEFAULT_VERIFIER_MODEL).toContain('claude-haiku');
    expect(typeof DEFAULT_VERIFIER_MODEL).toBe('string');
  });

  it('DEFAULT_MAX_TOKENS가 양수 정수이다', () => {
    expect(DEFAULT_MAX_TOKENS).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_MAX_TOKENS)).toBe(true);
  });

  it('DEFAULT_MAX_TOKENS가 4096이다', () => {
    expect(DEFAULT_MAX_TOKENS).toBe(4096);
  });
});

// ── DEFAULT_CONFIG 구조 검증 / Default Config Structure ──────

describe('DEFAULT_CONFIG', () => {
  it('embedding 섹션이 존재하고 필수 필드를 갖는다', () => {
    expect(DEFAULT_CONFIG.embedding).toBeDefined();
    expect(typeof DEFAULT_CONFIG.embedding.default).toBe('string');
    expect(typeof DEFAULT_CONFIG.embedding.code).toBe('string');
    expect(DEFAULT_CONFIG.embedding.voyageApiKey).toBeNull();
  });

  it('testing 섹션의 모든 카운트가 양수이다', () => {
    const t = DEFAULT_CONFIG.testing;

    expect(t.unitCount).toBeGreaterThan(0);
    expect(t.moduleCount).toBeGreaterThan(0);
    expect(t.e2eCount).toBeGreaterThan(0);
    expect(t.integrationE2eCount).toBeGreaterThan(0);
  });

  it('testing.parallelWorkers가 "auto"이다', () => {
    expect(DEFAULT_CONFIG.testing.parallelWorkers).toBe('auto');
  });

  it('testing.e2eTimeoutSeconds가 양수이다', () => {
    expect(DEFAULT_CONFIG.testing.e2eTimeoutSeconds).toBeGreaterThan(0);
  });

  it('testing.cleanEnvType이 "local"이다', () => {
    expect(DEFAULT_CONFIG.testing.cleanEnvType).toBe('local');
  });

  it('testing.totalMemoryMb가 양수이다', () => {
    expect(DEFAULT_CONFIG.testing.totalMemoryMb).toBeGreaterThan(0);
  });

  it('verification 섹션의 모델 값이 유효하다', () => {
    const v = DEFAULT_CONFIG.verification;

    expect(['opus', 'sonnet']).toContain(v.layer1Model);
    expect(['opus', 'sonnet']).toContain(v.adevModel);
    expect(typeof v.opusEscalationOnFailure).toBe('boolean');
  });

  it('log.level이 유효한 값이다', () => {
    expect(['debug', 'info', 'warn', 'error']).toContain(DEFAULT_CONFIG.log.level);
  });

  it('log.level 기본값이 "info"이다', () => {
    expect(DEFAULT_CONFIG.log.level).toBe('info');
  });
});

// ── DeepPartial 타입 호환성 / DeepPartial Type Compatibility ─

describe('DeepPartial 타입 호환성', () => {
  it('빈 객체가 DeepPartial<ConfigSchema>에 호환된다', () => {
    const partial: DeepPartial<ConfigSchema> = {};

    expect(partial).toEqual({});
  });

  it('일부 필드만 설정된 partial이 타입에 호환된다', () => {
    const partial: DeepPartial<ConfigSchema> = {
      log: { level: 'debug' },
    };

    expect(partial.log?.level).toBe('debug');
    expect(partial.testing).toBeUndefined();
  });

  it('중첩 partial도 타입에 호환된다', () => {
    const partial: DeepPartial<ConfigSchema> = {
      testing: { unitCount: 5 },
      verification: { layer1Model: 'sonnet' },
    };

    expect(partial.testing?.unitCount).toBe(5);
    expect(partial.testing?.moduleCount).toBeUndefined();
    expect(partial.verification?.layer1Model).toBe('sonnet');
    expect(partial.verification?.opusEscalationOnFailure).toBeUndefined();
  });

  it('DEFAULT_CONFIG이 ConfigSchema에 호환된다', () => {
    const config: ConfigSchema = DEFAULT_CONFIG;

    expect(config.embedding).toBeDefined();
    expect(config.testing).toBeDefined();
    expect(config.verification).toBeDefined();
    expect(config.log).toBeDefined();
  });
});

// ── 엣지 케이스 / Edge Cases ─────────────────────────────────

describe('config-schema 엣지 케이스', () => {
  it('testing 카운트 간 크기 관계가 올바르다 (unit < module 아닐 수 있지만 integrationE2e가 가장 크다)', () => {
    const t = DEFAULT_CONFIG.testing;

    expect(t.integrationE2eCount).toBeGreaterThanOrEqual(t.e2eCount);
    expect(t.e2eCount).toBeGreaterThanOrEqual(t.unitCount);
  });

  it('verification.opusEscalationOnFailure 기본값이 true이다', () => {
    expect(DEFAULT_CONFIG.verification.opusEscalationOnFailure).toBe(true);
  });

  it('embedding.default과 embedding.code가 동일한 기본 모델을 사용한다', () => {
    expect(DEFAULT_CONFIG.embedding.default).toBe(DEFAULT_CONFIG.embedding.code);
  });
});
