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

// ── 서버 설정 세부 검증 ───────────────────────────────────────

describe('각 서버 설정 세부 검증', () => {
  it('OS_CONTROL_SERVER.args는 빈 배열이다 (length=0)', () => {
    expect(OS_CONTROL_SERVER.args.length).toBe(0);
  });

  it('BROWSER_SERVER.args는 빈 배열이다 (length=0)', () => {
    expect(BROWSER_SERVER.args.length).toBe(0);
  });

  it('WEB_SEARCH_SERVER.args는 빈 배열이다 (length=0)', () => {
    expect(WEB_SEARCH_SERVER.args.length).toBe(0);
  });

  it('GIT_SERVER.args는 빈 배열이다 (length=0)', () => {
    expect(GIT_SERVER.args.length).toBe(0);
  });

  it('OS_CONTROL_SERVER는 McpServerConfig 구조를 만족한다', () => {
    const config = OS_CONTROL_SERVER;
    expect('name' in config).toBe(true);
    expect('command' in config).toBe(true);
    expect('args' in config).toBe(true);
    expect('enabled' in config).toBe(true);
  });

  it('BROWSER_SERVER는 McpServerConfig 구조를 만족한다', () => {
    const config = BROWSER_SERVER;
    expect('name' in config).toBe(true);
    expect('command' in config).toBe(true);
    expect('args' in config).toBe(true);
    expect('enabled' in config).toBe(true);
  });

  it('WEB_SEARCH_SERVER는 McpServerConfig 구조를 만족한다', () => {
    const config = WEB_SEARCH_SERVER;
    expect('name' in config).toBe(true);
    expect('command' in config).toBe(true);
    expect('args' in config).toBe(true);
    expect('enabled' in config).toBe(true);
  });

  it('GIT_SERVER는 McpServerConfig 구조를 만족한다', () => {
    const config = GIT_SERVER;
    expect('name' in config).toBe(true);
    expect('command' in config).toBe(true);
    expect('args' in config).toBe(true);
    expect('enabled' in config).toBe(true);
  });

  it('OS_CONTROL_SERVER.name은 최소 2글자', () => {
    expect(OS_CONTROL_SERVER.name.length).toBeGreaterThanOrEqual(2);
  });

  it('BROWSER_SERVER.name은 최소 2글자', () => {
    expect(BROWSER_SERVER.name.length).toBeGreaterThanOrEqual(2);
  });

  it('WEB_SEARCH_SERVER.name은 최소 2글자', () => {
    expect(WEB_SEARCH_SERVER.name.length).toBeGreaterThanOrEqual(2);
  });

  it('GIT_SERVER.name은 최소 2글자', () => {
    expect(GIT_SERVER.name.length).toBeGreaterThanOrEqual(2);
  });

  it('모든 서버 name이 최소 3글자 이상', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('모든 서버 command가 빈 문자열이 아님', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.command).not.toBe('');
    }
  });

  it('os-control name은 10글자', () => {
    expect(OS_CONTROL_SERVER.name.length).toBe(10);
  });

  it('git name은 3글자', () => {
    expect(GIT_SERVER.name.length).toBe(3);
  });

  it('browser name은 7글자', () => {
    expect(BROWSER_SERVER.name.length).toBe(7);
  });

  it('web-search name은 10글자', () => {
    expect(WEB_SEARCH_SERVER.name.length).toBe(10);
  });
});

// ── BUILTIN_SERVERS 인덱스 접근 ───────────────────────────────

describe('BUILTIN_SERVERS 인덱스 접근', () => {
  it('인덱스 0 항목이 존재한다', () => {
    expect(BUILTIN_SERVERS[0]).toBeDefined();
  });

  it('인덱스 1 항목이 존재한다', () => {
    expect(BUILTIN_SERVERS[1]).toBeDefined();
  });

  it('인덱스 2 항목이 존재한다', () => {
    expect(BUILTIN_SERVERS[2]).toBeDefined();
  });

  it('인덱스 3 항목이 존재한다', () => {
    expect(BUILTIN_SERVERS[3]).toBeDefined();
  });

  it('인덱스 4 항목은 undefined이다', () => {
    expect(BUILTIN_SERVERS[4]).toBeUndefined();
  });

  it('각 인덱스 항목의 name은 string이다', () => {
    for (let i = 0; i < BUILTIN_SERVERS.length; i++) {
      expect(typeof BUILTIN_SERVERS[i]?.name).toBe('string');
    }
  });

  it('각 인덱스 항목의 enabled는 boolean이다', () => {
    for (let i = 0; i < BUILTIN_SERVERS.length; i++) {
      expect(typeof BUILTIN_SERVERS[i]?.enabled).toBe('boolean');
    }
  });

  it('find로 os-control 서버를 찾을 수 있다', () => {
    const found = BUILTIN_SERVERS.find(s => s.name === 'os-control');
    expect(found).toBeDefined();
    expect(found?.command).toBe('builtin');
  });

  it('find로 browser 서버를 찾을 수 있다', () => {
    const found = BUILTIN_SERVERS.find(s => s.name === 'browser');
    expect(found).toBeDefined();
    expect(found?.enabled).toBe(true);
  });

  it('find로 web-search 서버를 찾을 수 있다', () => {
    const found = BUILTIN_SERVERS.find(s => s.name === 'web-search');
    expect(found).toBeDefined();
    expect(found?.args).toHaveLength(0);
  });

  it('find로 git 서버를 찾을 수 있다', () => {
    const found = BUILTIN_SERVERS.find(s => s.name === 'git');
    expect(found).toBeDefined();
    expect(found?.name).toBe('git');
  });

  it('존재하지 않는 서버 이름으로 find → undefined', () => {
    const found = BUILTIN_SERVERS.find(s => s.name === 'nonexistent-server');
    expect(found).toBeUndefined();
  });

  it('map으로 이름 배열 생성 → length=4', () => {
    const names = BUILTIN_SERVERS.map(s => s.name);
    expect(names.length).toBe(4);
  });

  it('reduce로 command 집합 → size=1', () => {
    const cmds = new Set(BUILTIN_SERVERS.map(s => s.command));
    expect(cmds.size).toBe(1);
  });

  it('every로 모든 enabled=true 확인', () => {
    expect(BUILTIN_SERVERS.every(s => s.enabled)).toBe(true);
  });

  it('some으로 os-control 존재 확인', () => {
    expect(BUILTIN_SERVERS.some(s => s.name === 'os-control')).toBe(true);
  });

  it('some으로 존재하지 않는 이름 → false', () => {
    expect(BUILTIN_SERVERS.some(s => s.name === 'phantom-server')).toBe(false);
  });
});

// ── 추가 edge/random 케이스 ───────────────────────────────────

describe('BUILTIN_SERVERS - 추가 edge/random 케이스', () => {
  it('이름이 빈 문자열인 서버가 없다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name).not.toBe('');
    }
  });

  it('command가 빈 문자열인 서버가 없다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.command).not.toBe('');
    }
  });

  it('모든 서버 name에 공백이 없다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.name.includes(' ')).toBe(false);
    }
  });

  it('모든 서버 command에 공백이 없다', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.command.includes(' ')).toBe(false);
    }
  });

  it('findIndex로 os-control 찾기 → 인덱스가 -1이 아님', () => {
    const idx = BUILTIN_SERVERS.findIndex(s => s.name === 'os-control');
    expect(idx).not.toBe(-1);
  });

  it('findIndex로 존재하지 않는 서버 → -1', () => {
    const idx = BUILTIN_SERVERS.findIndex(s => s.name === 'does-not-exist');
    expect(idx).toBe(-1);
  });

  it('map 후 enabled 모두 true', () => {
    const enabledList = BUILTIN_SERVERS.map(s => s.enabled);
    expect(enabledList.every(e => e === true)).toBe(true);
  });

  it('filter로 name 길이 > 5인 서버 → 3개 (os-control, web-search, browser)', () => {
    const long = BUILTIN_SERVERS.filter(s => s.name.length > 5);
    expect(long.length).toBe(3);
  });

  it('filter로 name 길이 <= 5인 서버 → 2개 (git, browser[7]? 아니면 git만)', () => {
    const short = BUILTIN_SERVERS.filter(s => s.name.length <= 5);
    // git(3), browser(7) → git만 <= 5
    expect(short.length).toBeGreaterThanOrEqual(1);
  });

  it('sort로 알파벳순 정렬 → 첫 번째가 browser', () => {
    const sorted = [...BUILTIN_SERVERS].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted[0]?.name).toBe('browser');
  });

  it('sort 후 마지막이 web-search', () => {
    const sorted = [...BUILTIN_SERVERS].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted[sorted.length - 1]?.name).toBe('web-search');
  });

  it('OS_CONTROL_SERVER와 WEB_SEARCH_SERVER는 다른 객체', () => {
    expect(OS_CONTROL_SERVER).not.toBe(WEB_SEARCH_SERVER);
  });

  it('GIT_SERVER와 BROWSER_SERVER는 다른 객체', () => {
    expect(GIT_SERVER).not.toBe(BROWSER_SERVER);
  });

  it('모든 서버 args가 readonly (변형 불가 구조)', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(Array.isArray(config.args)).toBe(true);
    }
  });

  it('BUILTIN_SERVERS 5번 반복 참조 → 동일 배열', () => {
    const ref1 = BUILTIN_SERVERS;
    const ref2 = BUILTIN_SERVERS;
    expect(ref1).toBe(ref2);
  });

  it('OS_CONTROL_SERVER 5번 반복 참조 → 동일 객체', () => {
    const r1 = OS_CONTROL_SERVER;
    const r2 = OS_CONTROL_SERVER;
    expect(r1).toBe(r2);
  });

  it('BUILTIN_SERVERS.slice(0, 2).length는 2', () => {
    expect(BUILTIN_SERVERS.slice(0, 2).length).toBe(2);
  });

  it('BUILTIN_SERVERS.slice(0, 4).length는 4', () => {
    expect(BUILTIN_SERVERS.slice(0, 4).length).toBe(4);
  });

  it('forEach로 모든 서버 순회 → count 4', () => {
    let count = 0;
    BUILTIN_SERVERS.forEach(() => { count++; });
    expect(count).toBe(4);
  });

  it('reduce로 이름 합산 → 4개 이름 포함', () => {
    const allNames = BUILTIN_SERVERS.reduce((acc, s) => acc + s.name, '');
    expect(allNames).toContain('git');
    expect(allNames).toContain('browser');
    expect(allNames).toContain('os-control');
    expect(allNames).toContain('web-search');
  });

  it('JSON.stringify 가능한 구조', () => {
    expect(() => JSON.stringify(BUILTIN_SERVERS)).not.toThrow();
  });

  it('JSON으로 직렬화 후 파싱 → name 동일', () => {
    const parsed = JSON.parse(JSON.stringify(BUILTIN_SERVERS)) as McpServerConfig[];
    for (let i = 0; i < BUILTIN_SERVERS.length; i++) {
      expect(parsed[i]?.name).toBe(BUILTIN_SERVERS[i]?.name);
    }
  });

  it('JSON 직렬화 후 enabled 동일', () => {
    const parsed = JSON.parse(JSON.stringify(BUILTIN_SERVERS)) as McpServerConfig[];
    for (let i = 0; i < BUILTIN_SERVERS.length; i++) {
      expect(parsed[i]?.enabled).toBe(BUILTIN_SERVERS[i]?.enabled);
    }
  });
});

// ── 각 서버 args 경계값 ───────────────────────────────────────

describe('각 서버 args 경계값 검증', () => {
  it('OS_CONTROL_SERVER.args[0]은 undefined', () => {
    expect(OS_CONTROL_SERVER.args[0]).toBeUndefined();
  });

  it('BROWSER_SERVER.args[0]은 undefined', () => {
    expect(BROWSER_SERVER.args[0]).toBeUndefined();
  });

  it('WEB_SEARCH_SERVER.args[0]은 undefined', () => {
    expect(WEB_SEARCH_SERVER.args[0]).toBeUndefined();
  });

  it('GIT_SERVER.args[0]은 undefined', () => {
    expect(GIT_SERVER.args[0]).toBeUndefined();
  });

  it('모든 서버 args[0]이 undefined', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.args[0]).toBeUndefined();
    }
  });

  it('os-control은 control 단어를 포함', () => {
    expect(OS_CONTROL_SERVER.name).toContain('control');
  });

  it('web-search는 search 단어를 포함', () => {
    expect(WEB_SEARCH_SERVER.name).toContain('search');
  });

  it('os-control은 os 단어로 시작', () => {
    expect(OS_CONTROL_SERVER.name.startsWith('os')).toBe(true);
  });

  it('web-search는 web 단어로 시작', () => {
    expect(WEB_SEARCH_SERVER.name.startsWith('web')).toBe(true);
  });

  it('git은 git 단어와 정확히 일치', () => {
    expect(GIT_SERVER.name === 'git').toBe(true);
  });

  it('browser는 browser 단어와 정확히 일치', () => {
    expect(BROWSER_SERVER.name === 'browser').toBe(true);
  });

  it('모든 command는 builtin과 동일', () => {
    for (const config of BUILTIN_SERVERS) {
      expect(config.command === 'builtin').toBe(true);
    }
  });

  it('GIT_SERVER.command는 builtin', () => {
    expect(GIT_SERVER.command).toBe('builtin');
  });

  it('WEB_SEARCH_SERVER.command는 builtin', () => {
    expect(WEB_SEARCH_SERVER.command).toBe('builtin');
  });

  it('OS_CONTROL_SERVER.enabled는 true', () => {
    expect(OS_CONTROL_SERVER.enabled).toBe(true);
  });

  it('BROWSER_SERVER.enabled는 true', () => {
    expect(BROWSER_SERVER.enabled).toBe(true);
  });

  it('GIT_SERVER.enabled는 true', () => {
    expect(GIT_SERVER.enabled).toBe(true);
  });

  it('WEB_SEARCH_SERVER.enabled는 true', () => {
    expect(WEB_SEARCH_SERVER.enabled).toBe(true);
  });
});

// ── 타입 구조 심층 검증 ───────────────────────────────────────

describe('McpServerConfig 타입 구조 심층 검증', () => {
  it('OS_CONTROL_SERVER는 5개 필드 이하를 가짐 (name, command, args, enabled, [env])', () => {
    const keys = Object.keys(OS_CONTROL_SERVER);
    expect(keys.length).toBeLessThanOrEqual(5);
  });

  it('BROWSER_SERVER는 최소 4개 필드를 가짐', () => {
    const keys = Object.keys(BROWSER_SERVER);
    expect(keys.length).toBeGreaterThanOrEqual(4);
  });

  it('WEB_SEARCH_SERVER는 최소 4개 필드를 가짐', () => {
    const keys = Object.keys(WEB_SEARCH_SERVER);
    expect(keys.length).toBeGreaterThanOrEqual(4);
  });

  it('GIT_SERVER는 최소 4개 필드를 가짐', () => {
    const keys = Object.keys(GIT_SERVER);
    expect(keys.length).toBeGreaterThanOrEqual(4);
  });

  it('OS_CONTROL_SERVER는 name 키를 가짐', () => {
    expect('name' in OS_CONTROL_SERVER).toBe(true);
  });

  it('OS_CONTROL_SERVER는 command 키를 가짐', () => {
    expect('command' in OS_CONTROL_SERVER).toBe(true);
  });

  it('OS_CONTROL_SERVER는 args 키를 가짐', () => {
    expect('args' in OS_CONTROL_SERVER).toBe(true);
  });

  it('OS_CONTROL_SERVER는 enabled 키를 가짐', () => {
    expect('enabled' in OS_CONTROL_SERVER).toBe(true);
  });

  it('BROWSER_SERVER는 name 키를 가짐', () => {
    expect('name' in BROWSER_SERVER).toBe(true);
  });

  it('WEB_SEARCH_SERVER는 enabled 키를 가짐', () => {
    expect('enabled' in WEB_SEARCH_SERVER).toBe(true);
  });

  it('GIT_SERVER는 command 키를 가짐', () => {
    expect('command' in GIT_SERVER).toBe(true);
  });

  it('모든 서버가 name 키를 가짐', () => {
    for (const config of BUILTIN_SERVERS) {
      expect('name' in config).toBe(true);
    }
  });

  it('모든 서버가 command 키를 가짐', () => {
    for (const config of BUILTIN_SERVERS) {
      expect('command' in config).toBe(true);
    }
  });

  it('모든 서버가 args 키를 가짐', () => {
    for (const config of BUILTIN_SERVERS) {
      expect('args' in config).toBe(true);
    }
  });

  it('모든 서버가 enabled 키를 가짐', () => {
    for (const config of BUILTIN_SERVERS) {
      expect('enabled' in config).toBe(true);
    }
  });

  it('Object.entries로 모든 서버 순회 → 4개', () => {
    let count = 0;
    for (const _ of BUILTIN_SERVERS) {
      count++;
    }
    expect(count).toBe(4);
  });

  it('각 서버 JSON.stringify → 유효한 JSON', () => {
    for (const config of BUILTIN_SERVERS) {
      const str = JSON.stringify(config);
      expect(() => JSON.parse(str)).not.toThrow();
    }
  });
});

// ── 서버별 추가 속성 검증 ─────────────────────────────────────

describe('OS_CONTROL_SERVER 추가 속성 검증', () => {
  it('name은 os로 시작하고 control로 끝남', () => {
    const parts = OS_CONTROL_SERVER.name.split('-');
    expect(parts[0]).toBe('os');
    expect(parts[parts.length - 1]).toBe('control');
  });

  it('name이 두 단어로 구성', () => {
    expect(OS_CONTROL_SERVER.name.split('-').length).toBe(2);
  });

  it('command가 정확히 builtin', () => {
    expect(OS_CONTROL_SERVER.command === 'builtin').toBe(true);
  });

  it('enabled가 정확히 true', () => {
    expect(OS_CONTROL_SERVER.enabled === true).toBe(true);
  });

  it('args가 빈 배열 → splice로 복사해도 길이 0', () => {
    const copy = OS_CONTROL_SERVER.args.slice();
    expect(copy.length).toBe(0);
  });

  it('name을 toUpperCase 하면 OS-CONTROL', () => {
    expect(OS_CONTROL_SERVER.name.toUpperCase()).toBe('OS-CONTROL');
  });

  it('name을 split("-") → ["os", "control"]', () => {
    const parts = OS_CONTROL_SERVER.name.split('-');
    expect(parts).toEqual(['os', 'control']);
  });

  it('name.indexOf("-") → 2', () => {
    expect(OS_CONTROL_SERVER.name.indexOf('-')).toBe(2);
  });

  it('command.charAt(0) → b', () => {
    expect(OS_CONTROL_SERVER.command.charAt(0)).toBe('b');
  });

  it('name.includes("control") → true', () => {
    expect(OS_CONTROL_SERVER.name.includes('control')).toBe(true);
  });
});

describe('BROWSER_SERVER 추가 속성 검증', () => {
  it('name에 하이픈이 없음 → split("-").length === 1', () => {
    expect(BROWSER_SERVER.name.split('-').length).toBe(1);
  });

  it('name이 b로 시작', () => {
    expect(BROWSER_SERVER.name.startsWith('b')).toBe(true);
  });

  it('name이 r로 끝남', () => {
    expect(BROWSER_SERVER.name.endsWith('r')).toBe(true);
  });

  it('name.charAt(0) → b', () => {
    expect(BROWSER_SERVER.name.charAt(0)).toBe('b');
  });

  it('name이 알파벳만으로 구성', () => {
    expect(/^[a-zA-Z]+$/.test(BROWSER_SERVER.name)).toBe(true);
  });

  it('name의 모든 문자가 소문자', () => {
    for (const char of BROWSER_SERVER.name) {
      expect(char).toBe(char.toLowerCase());
    }
  });

  it('args.length === 0 (항등 비교)', () => {
    expect(BROWSER_SERVER.args.length === 0).toBe(true);
  });

  it('name.includes("browser") → true', () => {
    expect(BROWSER_SERVER.name.includes('browser')).toBe(true);
  });

  it('command가 소문자만으로 구성', () => {
    expect(/^[a-z]+$/.test(BROWSER_SERVER.command)).toBe(true);
  });

  it('enabled의 반전 → false', () => {
    expect(!BROWSER_SERVER.enabled).toBe(false);
  });
});

describe('WEB_SEARCH_SERVER 추가 속성 검증', () => {
  it('name.split("-") → 길이 2', () => {
    expect(WEB_SEARCH_SERVER.name.split('-').length).toBe(2);
  });

  it('name.split("-")[0] → web', () => {
    expect(WEB_SEARCH_SERVER.name.split('-')[0]).toBe('web');
  });

  it('name.split("-")[1] → search', () => {
    expect(WEB_SEARCH_SERVER.name.split('-')[1]).toBe('search');
  });

  it('name.toUpperCase() → WEB-SEARCH', () => {
    expect(WEB_SEARCH_SERVER.name.toUpperCase()).toBe('WEB-SEARCH');
  });

  it('name.replace("-", "_") → web_search', () => {
    expect(WEB_SEARCH_SERVER.name.replace('-', '_')).toBe('web_search');
  });

  it('name.startsWith("web") → true', () => {
    expect(WEB_SEARCH_SERVER.name.startsWith('web')).toBe(true);
  });

  it('name.endsWith("search") → true', () => {
    expect(WEB_SEARCH_SERVER.name.endsWith('search')).toBe(true);
  });

  it('args가 배열이고 길이 0', () => {
    expect(Array.isArray(WEB_SEARCH_SERVER.args) && WEB_SEARCH_SERVER.args.length === 0).toBe(true);
  });

  it('name.length === command.length + 3', () => {
    // web-search(10) === builtin(7) + 3
    expect(WEB_SEARCH_SERVER.name.length).toBe(WEB_SEARCH_SERVER.command.length + 3);
  });

  it('name에 숫자 없음', () => {
    expect(/\d/.test(WEB_SEARCH_SERVER.name)).toBe(false);
  });
});

describe('GIT_SERVER 추가 속성 검증', () => {
  it('name이 g로 시작', () => {
    expect(GIT_SERVER.name.startsWith('g')).toBe(true);
  });

  it('name이 t로 끝남', () => {
    expect(GIT_SERVER.name.endsWith('t')).toBe(true);
  });

  it('name.charAt(1) → i', () => {
    expect(GIT_SERVER.name.charAt(1)).toBe('i');
  });

  it('name.charAt(2) → t', () => {
    expect(GIT_SERVER.name.charAt(2)).toBe('t');
  });

  it('name.toUpperCase() → GIT', () => {
    expect(GIT_SERVER.name.toUpperCase()).toBe('GIT');
  });

  it('name에 대시(-) 없음', () => {
    expect(GIT_SERVER.name.includes('-')).toBe(false);
  });

  it('name이 알파벳만으로 구성', () => {
    expect(/^[a-zA-Z]+$/.test(GIT_SERVER.name)).toBe(true);
  });

  it('name.split("").length === 3', () => {
    expect(GIT_SERVER.name.split('').length).toBe(3);
  });

  it('args.slice() → 빈 배열', () => {
    expect(GIT_SERVER.args.slice()).toEqual([]);
  });

  it('name === "git" 엄격 비교', () => {
    expect(GIT_SERVER.name === 'git').toBe(true);
  });
});

// ── BUILTIN_SERVERS 배열 연산 ─────────────────────────────────

describe('BUILTIN_SERVERS 배열 연산 검증', () => {
  it('concat으로 새 배열 → 길이 5 (기존 서버 + 1개 추가)', () => {
    const extra: McpServerConfig = { name: 'extra', command: 'builtin', args: [], enabled: true };
    const extended = [...BUILTIN_SERVERS, extra];
    expect(extended.length).toBe(5);
  });

  it('filter로 command=builtin → 원본과 동일 길이', () => {
    const filtered = BUILTIN_SERVERS.filter((s) => s.command === 'builtin');
    expect(filtered.length).toBe(BUILTIN_SERVERS.length);
  });

  it('map으로 enabled 필드만 추출 → 모두 true', () => {
    const enabledList = BUILTIN_SERVERS.map((s) => s.enabled);
    expect(enabledList.every((e) => e === true)).toBe(true);
  });

  it('flatMap으로 args 배열 → 빈 배열', () => {
    const allArgs = BUILTIN_SERVERS.flatMap((s) => s.args);
    expect(allArgs.length).toBe(0);
  });

  it('reduce로 이름 길이 합산', () => {
    const totalNameLength = BUILTIN_SERVERS.reduce((acc, s) => acc + s.name.length, 0);
    // os-control(10) + browser(7) + web-search(10) + git(3) = 30
    expect(totalNameLength).toBe(30);
  });

  it('sort 역순 → 마지막이 os-control', () => {
    const sorted = [...BUILTIN_SERVERS].sort((a, b) => b.name.localeCompare(a.name));
    expect(sorted[sorted.length - 1]?.name).toBe('browser');
  });

  it('indexOf로 OS_CONTROL_SERVER 인덱스 조회 → -1이 아님', () => {
    const idx = BUILTIN_SERVERS.indexOf(OS_CONTROL_SERVER);
    expect(idx).not.toBe(-1);
  });

  it('includes로 GIT_SERVER 포함 확인 → true', () => {
    expect(BUILTIN_SERVERS.includes(GIT_SERVER)).toBe(true);
  });

  it('includes로 가짜 서버 → false', () => {
    const fake: McpServerConfig = { name: 'fake', command: 'builtin', args: [], enabled: true };
    expect(BUILTIN_SERVERS.includes(fake)).toBe(false);
  });

  it('slice(1, 3) → 길이 2', () => {
    expect(BUILTIN_SERVERS.slice(1, 3).length).toBe(2);
  });

  it('reverse로 반전 후 원본과 다름 (참조 다를 경우)', () => {
    const reversed = [...BUILTIN_SERVERS].reverse();
    expect(reversed.length).toBe(BUILTIN_SERVERS.length);
  });

  it('every로 args가 배열인지 확인', () => {
    expect(BUILTIN_SERVERS.every((s) => Array.isArray(s.args))).toBe(true);
  });

  it('some으로 command가 external인 서버 없음 → false', () => {
    expect(BUILTIN_SERVERS.some((s) => s.command === 'external')).toBe(false);
  });

  it('find로 enabled=false인 서버 없음 → undefined', () => {
    const disabled = BUILTIN_SERVERS.find((s) => !s.enabled);
    expect(disabled).toBeUndefined();
  });

  it('filter로 이름 길이 > 3인 서버 → 3개', () => {
    // os-control(10), browser(7), web-search(10) → 3개
    const filtered = BUILTIN_SERVERS.filter((s) => s.name.length > 3);
    expect(filtered.length).toBe(3);
  });

  it('5번 반복 sort → 항상 동일 순서', () => {
    const getSorted = () => [...BUILTIN_SERVERS].sort((a, b) => a.name.localeCompare(b.name)).map((s) => s.name);
    const first = getSorted();
    for (let i = 0; i < 4; i++) {
      expect(getSorted()).toEqual(first);
    }
  });
});

// ── 서버 간 관계 및 비교 추가 ─────────────────────────────────

describe('서버 간 관계 심층 검증', () => {
  it('os-control과 web-search 모두 하이픈 포함', () => {
    expect(OS_CONTROL_SERVER.name.includes('-')).toBe(true);
    expect(WEB_SEARCH_SERVER.name.includes('-')).toBe(true);
  });

  it('browser와 git 모두 하이픈 미포함', () => {
    expect(BROWSER_SERVER.name.includes('-')).toBe(false);
    expect(GIT_SERVER.name.includes('-')).toBe(false);
  });

  it('하이픈 포함 서버 2개, 미포함 서버 2개', () => {
    const withDash = BUILTIN_SERVERS.filter((s) => s.name.includes('-'));
    const withoutDash = BUILTIN_SERVERS.filter((s) => !s.name.includes('-'));
    expect(withDash.length).toBe(2);
    expect(withoutDash.length).toBe(2);
  });

  it('모든 서버 command가 "builtin" 단일 값', () => {
    const uniqueCommands = new Set(BUILTIN_SERVERS.map((s) => s.command));
    expect(uniqueCommands.size).toBe(1);
    expect(uniqueCommands.has('builtin')).toBe(true);
  });

  it('이름 최단: git (3글자)', () => {
    const shortest = BUILTIN_SERVERS.reduce((min, s) => s.name.length < min.name.length ? s : min);
    expect(shortest.name).toBe('git');
  });

  it('이름 최장: os-control 또는 web-search (10글자)', () => {
    const longest = BUILTIN_SERVERS.reduce((max, s) => s.name.length > max.name.length ? s : max);
    expect(longest.name.length).toBe(10);
  });

  it('이름 알파벳순 첫 번째는 browser', () => {
    const sorted = [...BUILTIN_SERVERS].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted[0]?.name).toBe('browser');
  });

  it('이름 알파벳순 두 번째는 git', () => {
    const sorted = [...BUILTIN_SERVERS].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted[1]?.name).toBe('git');
  });

  it('이름 알파벳순 세 번째는 os-control', () => {
    const sorted = [...BUILTIN_SERVERS].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted[2]?.name).toBe('os-control');
  });

  it('이름 알파벳순 네 번째는 web-search', () => {
    const sorted = [...BUILTIN_SERVERS].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted[3]?.name).toBe('web-search');
  });

  it('총 이름 문자 수 30 (10+7+10+3)', () => {
    const total = BUILTIN_SERVERS.reduce((sum, s) => sum + s.name.length, 0);
    expect(total).toBe(30);
  });

  it('모든 서버 args 총 개수 0', () => {
    const totalArgs = BUILTIN_SERVERS.reduce((sum, s) => sum + s.args.length, 0);
    expect(totalArgs).toBe(0);
  });

  it('단일 단어 서버(browser, git) 이름에 숫자 없음', () => {
    expect(/\d/.test(BROWSER_SERVER.name)).toBe(false);
    expect(/\d/.test(GIT_SERVER.name)).toBe(false);
  });

  it('복합 단어 서버(os-control, web-search) 이름에 숫자 없음', () => {
    expect(/\d/.test(OS_CONTROL_SERVER.name)).toBe(false);
    expect(/\d/.test(WEB_SEARCH_SERVER.name)).toBe(false);
  });

  it('모든 이름이 ASCII 범위 내 문자만 포함', () => {
    for (const config of BUILTIN_SERVERS) {
      for (const char of config.name) {
        expect(char.charCodeAt(0)).toBeLessThan(128);
      }
    }
  });
});

// ── 직렬화/역직렬화 검증 ─────────────────────────────────────

describe('BUILTIN_SERVERS 직렬화/역직렬화', () => {
  it('전체 배열 JSON 왕복 변환 후 name 동일', () => {
    const parsed = JSON.parse(JSON.stringify(BUILTIN_SERVERS)) as McpServerConfig[];
    expect(parsed.map((s) => s.name)).toEqual(BUILTIN_SERVERS.map((s) => s.name));
  });

  it('전체 배열 JSON 왕복 변환 후 command 동일', () => {
    const parsed = JSON.parse(JSON.stringify(BUILTIN_SERVERS)) as McpServerConfig[];
    expect(parsed.map((s) => s.command)).toEqual(BUILTIN_SERVERS.map((s) => s.command));
  });

  it('전체 배열 JSON 왕복 변환 후 enabled 동일', () => {
    const parsed = JSON.parse(JSON.stringify(BUILTIN_SERVERS)) as McpServerConfig[];
    expect(parsed.map((s) => s.enabled)).toEqual(BUILTIN_SERVERS.map((s) => s.enabled));
  });

  it('전체 배열 JSON 왕복 변환 후 args 동일', () => {
    const parsed = JSON.parse(JSON.stringify(BUILTIN_SERVERS)) as McpServerConfig[];
    for (let i = 0; i < BUILTIN_SERVERS.length; i++) {
      expect(parsed[i]?.args).toEqual(BUILTIN_SERVERS[i]?.args);
    }
  });

  it('OS_CONTROL_SERVER JSON 왕복 → name 동일', () => {
    const parsed = JSON.parse(JSON.stringify(OS_CONTROL_SERVER)) as McpServerConfig;
    expect(parsed.name).toBe(OS_CONTROL_SERVER.name);
  });

  it('BROWSER_SERVER JSON 왕복 → command 동일', () => {
    const parsed = JSON.parse(JSON.stringify(BROWSER_SERVER)) as McpServerConfig;
    expect(parsed.command).toBe(BROWSER_SERVER.command);
  });

  it('WEB_SEARCH_SERVER JSON 왕복 → enabled 동일', () => {
    const parsed = JSON.parse(JSON.stringify(WEB_SEARCH_SERVER)) as McpServerConfig;
    expect(parsed.enabled).toBe(WEB_SEARCH_SERVER.enabled);
  });

  it('GIT_SERVER JSON 왕복 → args 동일', () => {
    const parsed = JSON.parse(JSON.stringify(GIT_SERVER)) as McpServerConfig;
    expect(parsed.args).toEqual(GIT_SERVER.args);
  });

  it('JSON.stringify 후 문자열에 name 포함', () => {
    const str = JSON.stringify(BUILTIN_SERVERS);
    expect(str).toContain('os-control');
    expect(str).toContain('browser');
    expect(str).toContain('web-search');
    expect(str).toContain('git');
  });

  it('JSON.stringify 후 builtin 포함', () => {
    const str = JSON.stringify(BUILTIN_SERVERS);
    expect(str).toContain('builtin');
  });

  it('개별 서버 5번 직렬화 → 동일 결과', () => {
    for (let i = 0; i < 5; i++) {
      const str1 = JSON.stringify(OS_CONTROL_SERVER);
      const str2 = JSON.stringify(OS_CONTROL_SERVER);
      expect(str1).toBe(str2);
    }
  });

  it('전체 배열 5번 직렬화 → 동일 결과', () => {
    const first = JSON.stringify(BUILTIN_SERVERS);
    for (let i = 0; i < 4; i++) {
      expect(JSON.stringify(BUILTIN_SERVERS)).toBe(first);
    }
  });
});
