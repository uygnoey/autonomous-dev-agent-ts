/**
 * MCP Handshake 단위 테스트 / MCP handshake unit tests
 *
 * @description
 * KR: HANDSHAKE_TIMEOUT_MS 상수 및 모듈 export 검증.
 *     performHandshake는 실제 프로세스가 필요하므로 상수와 export만 테스트.
 * EN: Tests for handshake constants and module exports.
 *     performHandshake requires real subprocess so only constants are tested.
 */

import { describe, expect, it } from 'bun:test';
import { HANDSHAKE_TIMEOUT_MS, performHandshake } from 'mcp/mcp-handshake.js';

describe('HANDSHAKE_TIMEOUT_MS', () => {
  it('숫자 타입이다', () => {
    expect(typeof HANDSHAKE_TIMEOUT_MS).toBe('number');
  });

  it('양수다', () => {
    expect(HANDSHAKE_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('10초 (10000ms)이다', () => {
    expect(HANDSHAKE_TIMEOUT_MS).toBe(10_000);
  });

  it('5초 이상이다 (합리적 타임아웃)', () => {
    expect(HANDSHAKE_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('60초 이하이다 (과도한 대기 방지)', () => {
    expect(HANDSHAKE_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});

describe('performHandshake export', () => {
  it('함수로 export된다', () => {
    expect(typeof performHandshake).toBe('function');
  });
});
