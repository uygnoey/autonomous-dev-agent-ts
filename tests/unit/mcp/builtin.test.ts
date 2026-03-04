import { describe, expect, it } from 'bun:test';
import {
  BROWSER_SERVER,
  BUILTIN_SERVERS,
  GIT_SERVER,
  OS_CONTROL_SERVER,
  WEB_SEARCH_SERVER,
} from '../../../src/mcp/builtin/index.js';
import type { McpServerConfig } from '../../../src/mcp/types.js';

describe('Built-in MCP Servers', () => {
  // ── 개별 설정 검증 ─────────────────────────────────────────

  describe('OS_CONTROL_SERVER', () => {
    it('유효한 설정 구조를 가진다', () => {
      assertValidConfig(OS_CONTROL_SERVER);
    });

    it('이름이 os-control이다', () => {
      expect(OS_CONTROL_SERVER.name).toBe('os-control');
    });
  });

  describe('BROWSER_SERVER', () => {
    it('유효한 설정 구조를 가진다', () => {
      assertValidConfig(BROWSER_SERVER);
    });

    it('이름이 browser이다', () => {
      expect(BROWSER_SERVER.name).toBe('browser');
    });
  });

  describe('WEB_SEARCH_SERVER', () => {
    it('유효한 설정 구조를 가진다', () => {
      assertValidConfig(WEB_SEARCH_SERVER);
    });

    it('이름이 web-search이다', () => {
      expect(WEB_SEARCH_SERVER.name).toBe('web-search');
    });
  });

  describe('GIT_SERVER', () => {
    it('유효한 설정 구조를 가진다', () => {
      assertValidConfig(GIT_SERVER);
    });

    it('이름이 git이다', () => {
      expect(GIT_SERVER.name).toBe('git');
    });
  });

  // ── BUILTIN_SERVERS 배열 ───────────────────────────────────

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

    it('os-control, browser, web-search, git 서버를 포함한다', () => {
      const names = BUILTIN_SERVERS.map((s) => s.name);
      expect(names).toContain('os-control');
      expect(names).toContain('browser');
      expect(names).toContain('web-search');
      expect(names).toContain('git');
    });
  });
});

// ── 헬퍼 ─────────────────────────────────────────────────────

/**
 * McpServerConfig의 필수 필드를 검증한다 / Validate required fields of McpServerConfig
 */
function assertValidConfig(config: McpServerConfig): void {
  expect(typeof config.name).toBe('string');
  expect(config.name.length).toBeGreaterThan(0);
  expect(typeof config.command).toBe('string');
  expect(config.command.length).toBeGreaterThan(0);
  expect(Array.isArray(config.args)).toBe(true);
  expect(typeof config.enabled).toBe('boolean');
}
