import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { McpRegistry } from '../../../src/mcp/registry.js';
import type { McpServerConfig } from '../../../src/mcp/types.js';

describe('McpRegistry', () => {
  const logger = new ConsoleLogger('error');

  function createConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
    return {
      name: 'test-server',
      command: 'npx',
      args: ['-y', '@test/mcp-server'],
      enabled: true,
      ...overrides,
    };
  }

  // ── register ────────────────────────────────────────────────

  describe('register', () => {
    it('서버 설정을 정상 등록한다', () => {
      const registry = new McpRegistry(logger);
      const config = createConfig();

      const result = registry.register(config);

      expect(result.ok).toBe(true);
    });

    it('등록된 서버를 조회할 수 있다', () => {
      const registry = new McpRegistry(logger);
      const config = createConfig({ name: 'my-server' });

      registry.register(config);
      const found = registry.getServer('my-server');

      expect(found).not.toBeNull();
      expect(found?.name).toBe('my-server');
      expect(found?.command).toBe('npx');
    });

    it('중복 이름 등록을 거부한다', () => {
      const registry = new McpRegistry(logger);
      registry.register(createConfig({ name: 'dup' }));

      const result = registry.register(createConfig({ name: 'dup' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_duplicate_server');
      }
    });

    it('빈 이름을 거부한다', () => {
      const registry = new McpRegistry(logger);

      const result = registry.register(createConfig({ name: '' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_invalid_config');
      }
    });

    it('공백만 있는 이름을 거부한다', () => {
      const registry = new McpRegistry(logger);

      const result = registry.register(createConfig({ name: '   ' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_invalid_config');
      }
    });

    it('빈 command를 거부한다', () => {
      const registry = new McpRegistry(logger);

      const result = registry.register(createConfig({ command: '' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_invalid_config');
      }
    });

    it('공백만 있는 command를 거부한다', () => {
      const registry = new McpRegistry(logger);

      const result = registry.register(createConfig({ command: '  ' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_invalid_config');
      }
    });
  });

  // ── unregister ──────────────────────────────────────────────

  describe('unregister', () => {
    it('등록된 서버를 해제한다', () => {
      const registry = new McpRegistry(logger);
      registry.register(createConfig({ name: 'removable' }));

      const result = registry.unregister('removable');

      expect(result.ok).toBe(true);
      expect(registry.getServer('removable')).toBeNull();
    });

    it('존재하지 않는 서버 해제를 거부한다', () => {
      const registry = new McpRegistry(logger);

      const result = registry.unregister('nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_not_found');
      }
    });

    it('해제 후 같은 이름으로 다시 등록할 수 있다', () => {
      const registry = new McpRegistry(logger);
      registry.register(createConfig({ name: 're-register' }));
      registry.unregister('re-register');

      const result = registry.register(createConfig({ name: 're-register' }));

      expect(result.ok).toBe(true);
    });
  });

  // ── getServer ───────────────────────────────────────────────

  describe('getServer', () => {
    it('존재하지 않는 서버는 null을 반환한다', () => {
      const registry = new McpRegistry(logger);

      expect(registry.getServer('nonexistent')).toBeNull();
    });
  });

  // ── listServers ─────────────────────────────────────────────

  describe('listServers', () => {
    it('등록된 모든 서버를 반환한다', () => {
      const registry = new McpRegistry(logger);
      registry.register(createConfig({ name: 'a' }));
      registry.register(createConfig({ name: 'b' }));
      registry.register(createConfig({ name: 'c' }));

      const servers = registry.listServers();

      expect(servers).toHaveLength(3);
      const names = servers.map((s) => s.name);
      expect(names).toContain('a');
      expect(names).toContain('b');
      expect(names).toContain('c');
    });

    it('빈 레지스트리는 빈 배열을 반환한다', () => {
      const registry = new McpRegistry(logger);

      expect(registry.listServers()).toHaveLength(0);
    });
  });

  // ── clear ───────────────────────────────────────────────────

  describe('clear', () => {
    it('모든 등록을 초기화한다', () => {
      const registry = new McpRegistry(logger);
      registry.register(createConfig({ name: 'x' }));
      registry.register(createConfig({ name: 'y' }));

      registry.clear();

      expect(registry.listServers()).toHaveLength(0);
      expect(registry.getServer('x')).toBeNull();
    });
  });
});
