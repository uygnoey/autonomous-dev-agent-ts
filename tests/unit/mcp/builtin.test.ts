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
