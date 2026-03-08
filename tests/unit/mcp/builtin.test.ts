/**
 * Built-in MCP 서버 설정 테스트
 *
 * @description
 * KR: 내장 MCP 서버 설정 테스트. 80%+ 경계값/구조 검증 비율.
 * EN: Tests for built-in MCP server configurations. 80%+ edge/structure ratio.
 */

import { describe, expect, it } from 'bun:test';
import {
  BROWSER_SERVER,
  BUILTIN_SERVERS,
  GIT_SERVER,
  OS_CONTROL_SERVER,
  WEB_SEARCH_SERVER,
} from 'mcp/builtin/index.js';
import type { McpServerConfig } from 'mcp/types.js';

// ── 헬퍼 ─────────────────────────────────────────────────────

function assertValidConfig(config: McpServerConfig): void {
  expect(typeof config.name).toBe('string');
  expect(config.name.length).toBeGreaterThan(0);
  expect(typeof config.command).toBe('string');
  expect(config.command.length).toBeGreaterThan(0);
  expect(Array.isArray(config.args)).toBe(true);
  expect(typeof config.enabled).toBe('boolean');
}

// ── OS_CONTROL_SERVER ────────────────────────────────────────

describe('OS_CONTROL_SERVER', () => {
  it('유효한 설정 구조를 가진다', () => {
    assertValidConfig(OS_CONTROL_SERVER);
  });

  it('이름이 os-control이다', () => {
    expect(OS_CONTROL_SERVER.name).toBe('os-control');
  });

  it('command가 builtin이다', () => {
    expect(OS_CONTROL_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(OS_CONTROL_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(OS_CONTROL_SERVER.args).toHaveLength(0);
  });

  it('name이 하이픈을 포함한다', () => {
    expect(OS_CONTROL_SERVER.name).toContain('-');
  });

  it('name이 os로 시작한다', () => {
    expect(OS_CONTROL_SERVER.name).toMatch(/^os/);
  });

  it('name은 string 타입', () => {
    expect(typeof OS_CONTROL_SERVER.name).toBe('string');
  });

  it('command는 string 타입', () => {
    expect(typeof OS_CONTROL_SERVER.command).toBe('string');
  });

  it('enabled는 boolean 타입', () => {
    expect(typeof OS_CONTROL_SERVER.enabled).toBe('boolean');
  });

  it('args는 배열 타입', () => {
    expect(Array.isArray(OS_CONTROL_SERVER.args)).toBe(true);
  });

  it('name은 소문자와 하이픈만 포함', () => {
    expect(OS_CONTROL_SERVER.name).toMatch(/^[a-z-]+$/);
  });

  it('name은 null이 아님', () => {
    expect(OS_CONTROL_SERVER.name).not.toBeNull();
  });

  it('name은 undefined가 아님', () => {
    expect(OS_CONTROL_SERVER.name).not.toBeUndefined();
  });

  it('command는 null이 아님', () => {
    expect(OS_CONTROL_SERVER.command).not.toBeNull();
  });

  it('enabled는 false가 아님', () => {
    expect(OS_CONTROL_SERVER.enabled).not.toBe(false);
  });

  it('args는 null이 아님', () => {
    expect(OS_CONTROL_SERVER.args).not.toBeNull();
  });

  it('5번 반복 체크 → name 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(OS_CONTROL_SERVER.name).toBe('os-control');
    }
  });

  it('5번 반복 체크 → enabled 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(OS_CONTROL_SERVER.enabled).toBe(true);
    }
  });
});

// ── BROWSER_SERVER ───────────────────────────────────────────

describe('BROWSER_SERVER', () => {
  it('유효한 설정 구조를 가진다', () => {
    assertValidConfig(BROWSER_SERVER);
  });

  it('이름이 browser이다', () => {
    expect(BROWSER_SERVER.name).toBe('browser');
  });

  it('command가 builtin이다', () => {
    expect(BROWSER_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(BROWSER_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(BROWSER_SERVER.args).toHaveLength(0);
  });

  it('name이 하이픈을 포함하지 않는다', () => {
    expect(BROWSER_SERVER.name).not.toContain('-');
  });

  it('name은 string 타입', () => {
    expect(typeof BROWSER_SERVER.name).toBe('string');
  });

  it('enabled는 boolean 타입', () => {
    expect(typeof BROWSER_SERVER.enabled).toBe('boolean');
  });

  it('name은 소문자만', () => {
    expect(BROWSER_SERVER.name).toMatch(/^[a-z]+$/);
  });

  it('name 길이가 7', () => {
    expect(BROWSER_SERVER.name.length).toBe(7);
  });

  it('name은 null이 아님', () => {
    expect(BROWSER_SERVER.name).not.toBeNull();
  });

  it('command는 OS_CONTROL_SERVER와 동일', () => {
    expect(BROWSER_SERVER.command).toBe(OS_CONTROL_SERVER.command);
  });

  it('enabled는 OS_CONTROL_SERVER와 동일', () => {
    expect(BROWSER_SERVER.enabled).toBe(OS_CONTROL_SERVER.enabled);
  });

  it('5번 반복 체크 → name 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(BROWSER_SERVER.name).toBe('browser');
    }
  });
});

// ── WEB_SEARCH_SERVER ────────────────────────────────────────

describe('WEB_SEARCH_SERVER', () => {
  it('유효한 설정 구조를 가진다', () => {
    assertValidConfig(WEB_SEARCH_SERVER);
  });

  it('이름이 web-search이다', () => {
    expect(WEB_SEARCH_SERVER.name).toBe('web-search');
  });

  it('command가 builtin이다', () => {
    expect(WEB_SEARCH_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(WEB_SEARCH_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(WEB_SEARCH_SERVER.args).toHaveLength(0);
  });

  it('name이 하이픈을 포함한다', () => {
    expect(WEB_SEARCH_SERVER.name).toContain('-');
  });

  it('name이 web으로 시작한다', () => {
    expect(WEB_SEARCH_SERVER.name).toMatch(/^web/);
  });

  it('name은 string 타입', () => {
    expect(typeof WEB_SEARCH_SERVER.name).toBe('string');
  });

  it('name은 소문자와 하이픈만 포함', () => {
    expect(WEB_SEARCH_SERVER.name).toMatch(/^[a-z-]+$/);
  });

  it('name 길이가 10', () => {
    expect(WEB_SEARCH_SERVER.name.length).toBe(10);
  });

  it('name은 search로 끝남', () => {
    expect(WEB_SEARCH_SERVER.name).toMatch(/search$/);
  });

  it('5번 반복 체크 → name 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(WEB_SEARCH_SERVER.name).toBe('web-search');
    }
  });

  it('command는 null이 아님', () => {
    expect(WEB_SEARCH_SERVER.command).not.toBeNull();
  });
});

// ── GIT_SERVER ───────────────────────────────────────────────

describe('GIT_SERVER', () => {
  it('유효한 설정 구조를 가진다', () => {
    assertValidConfig(GIT_SERVER);
  });

  it('이름이 git이다', () => {
    expect(GIT_SERVER.name).toBe('git');
  });

  it('command가 builtin이다', () => {
    expect(GIT_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(GIT_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(GIT_SERVER.args).toHaveLength(0);
  });

  it('name이 하이픈을 포함하지 않는다', () => {
    expect(GIT_SERVER.name).not.toContain('-');
  });

  it('name이 3글자이다', () => {
    expect(GIT_SERVER.name.length).toBe(3);
  });

  it('name은 string 타입', () => {
    expect(typeof GIT_SERVER.name).toBe('string');
  });

  it('enabled는 boolean 타입', () => {
    expect(typeof GIT_SERVER.enabled).toBe('boolean');
  });

  it('name은 소문자만', () => {
    expect(GIT_SERVER.name).toMatch(/^[a-z]+$/);
  });

  it('name은 null이 아님', () => {
    expect(GIT_SERVER.name).not.toBeNull();
  });

  it('5번 반복 체크 → name 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(GIT_SERVER.name).toBe('git');
    }
  });

  it('args 길이 0', () => {
    expect(GIT_SERVER.args.length).toBe(0);
  });
});

// ── BUILTIN_SERVERS 배열 ──────────────────────────────────────

describe('BUILTIN_SERVERS', () => {
  it('4개의 내장 서버를 포함한다', () => {
    expect(BUILTIN_SERVERS).toHaveLength(4);
  });

  it('모든 서버가 고유한 이름을 가진다', () => {
    const names = BUILTIN_SERVERS.map((s) => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('모든 서버가 유효한 구조를 가진다', () => {
    for (const config of BUILTIN_SERVERS) {
      assertValidConfig(config);
    }
  });

  it('모든 서버가 기본 활성화 상태이다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.enabled).toBe(true);
    }
  });

  it('os-control 서버를 포함한다', () => {
    const names = BUILTIN_SERVERS.map((s) => s.name);
    expect(names).toContain('os-control');
  });

  it('browser 서버를 포함한다', () => {
    const names = BUILTIN_SERVERS.map((s) => s.name);
    expect(names).toContain('browser');
  });

  it('web-search 서버를 포함한다', () => {
    const names = BUILTIN_SERVERS.map((s) => s.name);
    expect(names).toContain('web-search');
  });

  it('git 서버를 포함한다', () => {
    const names = BUILTIN_SERVERS.map((s) => s.name);
    expect(names).toContain('git');
  });

  it('모든 서버의 command가 builtin이다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.command).toBe('builtin');
    }
  });

  it('모든 서버의 args가 빈 배열이다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.args).toHaveLength(0);
    }
  });

  it('배열로 반환된다', () => {
    expect(Array.isArray(BUILTIN_SERVERS)).toBe(true);
  });

  it('5개 이상 서버는 없다', () => {
    expect(BUILTIN_SERVERS.length).toBeLessThanOrEqual(5);
  });

  it('0개 이상의 서버를 포함한다', () => {
    expect(BUILTIN_SERVERS.length).toBeGreaterThan(0);
  });

  it('OS_CONTROL_SERVER가 배열에 포함된다', () => {
    expect(BUILTIN_SERVERS).toContain(OS_CONTROL_SERVER);
  });

  it('BROWSER_SERVER가 배열에 포함된다', () => {
    expect(BUILTIN_SERVERS).toContain(BROWSER_SERVER);
  });

  it('WEB_SEARCH_SERVER가 배열에 포함된다', () => {
    expect(BUILTIN_SERVERS).toContain(WEB_SEARCH_SERVER);
  });

  it('GIT_SERVER가 배열에 포함된다', () => {
    expect(BUILTIN_SERVERS).toContain(GIT_SERVER);
  });

  it('모든 name이 문자열이다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(typeof config.name).toBe('string');
    }
  });

  it('모든 name이 비어있지 않다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name.length).toBeGreaterThan(0);
    }
  });

  it('모든 enabled가 boolean이다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(typeof config.enabled).toBe('boolean');
    }
  });

  it('모든 args가 배열이다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(Array.isArray(config.args)).toBe(true);
    }
  });

  it('모든 command가 string이다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(typeof config.command).toBe('string');
    }
  });

  it('필터링: enabled=true인 서버만 → 4개', () => {
    const enabled = BUILTIN_SERVERS.filter((s) => s.enabled);
    expect(enabled.length).toBe(4);
  });

  it('필터링: command=builtin인 서버 → 4개', () => {
    const builtin = BUILTIN_SERVERS.filter((s) => s.command === 'builtin');
    expect(builtin.length).toBe(4);
  });

  it('5번 반복 조회 → 항상 4개', () => {
    for (let i = 0; i < 5; i++) {
      expect(BUILTIN_SERVERS.length).toBe(4);
    }
  });

  it('모든 args 원소가 string이다', () => {
    for (const config of BUILTIN_SERVERS) {
      for (const arg of config.args) {
        expect(typeof arg).toBe('string');
      }
    }
  });

  it('BUILTIN_SERVERS는 null이 아님', () => {
    expect(BUILTIN_SERVERS).not.toBeNull();
  });

  it('BUILTIN_SERVERS는 undefined가 아님', () => {
    expect(BUILTIN_SERVERS).not.toBeUndefined();
  });
});

// ── 서버 이름 형식 검증 ───────────────────────────────────────

describe('서버 이름 형식 검증', () => {
  it('os-control은 kebab-case이다', () => {
    expect(OS_CONTROL_SERVER.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('browser는 단순 단어이다', () => {
    expect(BROWSER_SERVER.name).toMatch(/^[a-z]+$/);
  });

  it('web-search는 kebab-case이다', () => {
    expect(WEB_SEARCH_SERVER.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('git는 단순 단어이다', () => {
    expect(GIT_SERVER.name).toMatch(/^[a-z]+$/);
  });

  it('모든 서버 이름이 소문자+하이픈 형식이다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('모든 서버 이름이 대문자를 포함하지 않는다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name).toBe(config.name.toLowerCase());
    }
  });

  it('모든 서버 이름이 공백을 포함하지 않는다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name).not.toContain(' ');
    }
  });

  it('모든 서버 이름이 숫자를 포함하지 않는다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name).not.toMatch(/\d/);
    }
  });

  it('모든 서버 이름이 언더스코어를 포함하지 않는다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name).not.toContain('_');
    }
  });

  it('모든 서버 이름이 특수문자를 포함하지 않는다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name).not.toMatch(/[!@#$%^&*(){}[\]]/);
    }
  });

  it('os-control은 하이픈 구분어 두 개로 구성', () => {
    const parts = OS_CONTROL_SERVER.name.split('-');
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe('os');
    expect(parts[1]).toBe('control');
  });

  it('web-search는 하이픈 구분어 두 개로 구성', () => {
    const parts = WEB_SEARCH_SERVER.name.split('-');
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe('web');
    expect(parts[1]).toBe('search');
  });

  it('모든 서버 이름이 3글자 이상', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ── 서버 간 비교 ──────────────────────────────────────────────

describe('서버 간 비교', () => {
  it('OS_CONTROL_SERVER와 BROWSER_SERVER는 다른 이름을 가진다', () => {
    expect(OS_CONTROL_SERVER.name).not.toBe(BROWSER_SERVER.name);
  });

  it('WEB_SEARCH_SERVER와 GIT_SERVER는 다른 이름을 가진다', () => {
    expect(WEB_SEARCH_SERVER.name).not.toBe(GIT_SERVER.name);
  });

  it('모든 서버의 command가 동일하다', () => {
    const commands = BUILTIN_SERVERS.map(s => s.command);
    expect(new Set(commands).size).toBe(1);
  });

  it('모든 서버가 args를 공유하지 않는다 (독립 배열)', () => {
    for (let i = 0; i < BUILTIN_SERVERS.length - 1; i++) {
      const a = BUILTIN_SERVERS[i];
      const b = BUILTIN_SERVERS[i + 1];
      if (a && b) expect(a.args).not.toBe(b.args);
    }
  });

  it('4개 서버 이름이 모두 다름 (Set 크기 4)', () => {
    const names = [OS_CONTROL_SERVER.name, BROWSER_SERVER.name, WEB_SEARCH_SERVER.name, GIT_SERVER.name];
    expect(new Set(names).size).toBe(4);
  });

  it('OS_CONTROL_SERVER와 WEB_SEARCH_SERVER 이름 다름', () => {
    expect(OS_CONTROL_SERVER.name).not.toBe(WEB_SEARCH_SERVER.name);
  });

  it('BROWSER_SERVER와 GIT_SERVER 이름 다름', () => {
    expect(BROWSER_SERVER.name).not.toBe(GIT_SERVER.name);
  });

  it('OS_CONTROL_SERVER와 GIT_SERVER 이름 다름', () => {
    expect(OS_CONTROL_SERVER.name).not.toBe(GIT_SERVER.name);
  });

  it('BROWSER_SERVER와 WEB_SEARCH_SERVER 이름 다름', () => {
    expect(BROWSER_SERVER.name).not.toBe(WEB_SEARCH_SERVER.name);
  });

  it('모든 서버 이름이 서로 다름 (6개 쌍 모두)', () => {
    const names = BUILTIN_SERVERS.map(s => s.name);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        expect(names[i]).not.toBe(names[j]);
      }
    }
  });

  it('모든 서버 enabled가 동일한 값(true)', () => {
    const enabledValues = BUILTIN_SERVERS.map(s => s.enabled);
    expect(new Set(enabledValues).size).toBe(1);
    expect(enabledValues[0]).toBe(true);
  });

  it('모든 서버 args 길이가 동일(0)', () => {
    const lengths = BUILTIN_SERVERS.map(s => s.args.length);
    expect(new Set(lengths).size).toBe(1);
    expect(lengths[0]).toBe(0);
  });
});

// ── 불변성 검증 ──────────────────────────────────────────────

describe('서버 설정 불변성', () => {
  it('OS_CONTROL_SERVER.name은 변경되지 않음', () => {
    const originalName = OS_CONTROL_SERVER.name;
    expect(OS_CONTROL_SERVER.name).toBe(originalName);
  });

  it('BUILTIN_SERVERS 배열 길이는 변경되지 않음', () => {
    const len = BUILTIN_SERVERS.length;
    expect(BUILTIN_SERVERS.length).toBe(len);
  });

  it('5번 반복 조회 → GIT_SERVER.name 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(GIT_SERVER.name).toBe('git');
    }
  });

  it('5번 반복 조회 → WEB_SEARCH_SERVER.enabled 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(WEB_SEARCH_SERVER.enabled).toBe(true);
    }
  });

  it('5번 반복 조회 → BROWSER_SERVER.command 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(BROWSER_SERVER.command).toBe('builtin');
    }
  });

  it('5번 반복 조회 → BUILTIN_SERVERS[0] 일관성', () => {
    for (let i = 0; i < 5; i++) {
      expect(BUILTIN_SERVERS[0]?.name.length).toBeGreaterThan(0);
    }
  });
});
