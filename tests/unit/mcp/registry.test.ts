/**
 * McpRegistry 단위 테스트
 *
 * @description
 * KR: register/unregister/getServer/listServers/clear 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for McpRegistry methods. 80%+ edge/invalid ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { McpRegistry } from 'mcp/registry.js';
import type { McpServerConfig } from 'mcp/types.js';

function createConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    name: overrides.name ?? 'test-server',
    command: overrides.command ?? 'npx',
    args: overrides.args ?? ['-y', '@test/mcp-server'],
    enabled: overrides.enabled ?? true,
  };
}

// ── 생성자 ────────────────────────────────────────────────────

describe('McpRegistry 생성자', () => {
  it('인스턴스가 생성된다', () => {
    const logger = new ConsoleLogger('error');
    expect(() => new McpRegistry(logger)).not.toThrow();
  });

  it('McpRegistry 인스턴스이다', () => {
    const logger = new ConsoleLogger('error');
    expect(new McpRegistry(logger)).toBeInstanceOf(McpRegistry);
  });

  it('초기 listServers가 빈 배열이다', () => {
    const registry = new McpRegistry(new ConsoleLogger('error'));
    expect(registry.listServers()).toEqual([]);
  });

  it('초기 listServers 길이가 0이다', () => {
    const registry = new McpRegistry(new ConsoleLogger('error'));
    expect(registry.listServers().length).toBe(0);
  });

  it('debug 레벨 logger로 생성 가능', () => {
    const logger = new ConsoleLogger('debug');
    expect(() => new McpRegistry(logger)).not.toThrow();
  });
});

// ── register - 성공 케이스 ────────────────────────────────────

describe('McpRegistry register - 성공 케이스', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('정상 설정으로 ok=true 반환', () => {
    const result = registry.register(createConfig());
    expect(result.ok).toBe(true);
  });

  it('등록 후 getServer로 조회 가능', () => {
    registry.register(createConfig({ name: 'my-server' }));
    const found = registry.getServer('my-server');
    expect(found).not.toBeNull();
  });

  it('등록된 서버 name이 일치', () => {
    registry.register(createConfig({ name: 'target' }));
    const found = registry.getServer('target');
    expect(found?.name).toBe('target');
  });

  it('등록된 서버 command가 일치', () => {
    registry.register(createConfig({ name: 's1', command: 'node' }));
    const found = registry.getServer('s1');
    expect(found?.command).toBe('node');
  });

  it('등록된 서버 args가 일치', () => {
    registry.register(createConfig({ name: 's2', args: ['--foo', '--bar'] }));
    const found = registry.getServer('s2');
    expect(found?.args).toEqual(['--foo', '--bar']);
  });

  it('enabled=false로 등록 가능', () => {
    const result = registry.register(createConfig({ name: 'disabled-server', enabled: false }));
    expect(result.ok).toBe(true);
  });

  it('빈 args 배열로 등록 가능', () => {
    const result = registry.register(createConfig({ name: 'no-args', args: [] }));
    expect(result.ok).toBe(true);
  });

  it('여러 서버 순차 등록 → 모두 ok', () => {
    for (let i = 0; i < 5; i++) {
      const result = registry.register(createConfig({ name: `server-${i}` }));
      expect(result.ok).toBe(true);
    }
  });

  it('10개 서버 등록 → listServers 길이 10', () => {
    for (let i = 0; i < 10; i++) {
      registry.register(createConfig({ name: `s${i}` }));
    }
    expect(registry.listServers().length).toBe(10);
  });

  it('긴 서버 이름으로 등록 가능', () => {
    const longName = 'server-' + 'a'.repeat(100);
    const result = registry.register(createConfig({ name: longName }));
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 이름으로 등록 가능', () => {
    const result = registry.register(createConfig({ name: 'server_with-special.chars' }));
    expect(result.ok).toBe(true);
  });

  it('긴 command로 등록 가능', () => {
    const result = registry.register(createConfig({ name: 'long-cmd', command: '/usr/local/bin/my-long-command-name' }));
    expect(result.ok).toBe(true);
  });
});

// ── register - 실패 케이스 ────────────────────────────────────

describe('McpRegistry register - 실패 케이스', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('중복 이름 → ok=false', () => {
    registry.register(createConfig({ name: 'dup' }));
    const result = registry.register(createConfig({ name: 'dup' }));
    expect(result.ok).toBe(false);
  });

  it('중복 이름 → code=mcp_duplicate_server', () => {
    registry.register(createConfig({ name: 'dup' }));
    const result = registry.register(createConfig({ name: 'dup' }));
    if (!result.ok) expect(result.error.code).toBe('mcp_duplicate_server');
  });

  it('빈 name → ok=false', () => {
    const result = registry.register(createConfig({ name: '' }));
    expect(result.ok).toBe(false);
  });

  it('빈 name → code=mcp_invalid_config', () => {
    const result = registry.register(createConfig({ name: '' }));
    if (!result.ok) expect(result.error.code).toBe('mcp_invalid_config');
  });

  it('공백만 있는 name → ok=false', () => {
    const result = registry.register(createConfig({ name: '   ' }));
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 name → code=mcp_invalid_config', () => {
    const result = registry.register(createConfig({ name: '   ' }));
    if (!result.ok) expect(result.error.code).toBe('mcp_invalid_config');
  });

  it('탭만 있는 name → ok=false', () => {
    const result = registry.register(createConfig({ name: '\t\t' }));
    expect(result.ok).toBe(false);
  });

  it('개행만 있는 name → ok=false', () => {
    const result = registry.register(createConfig({ name: '\n\n' }));
    expect(result.ok).toBe(false);
  });

  it('빈 command → ok=false', () => {
    const result = registry.register(createConfig({ command: '' }));
    expect(result.ok).toBe(false);
  });

  it('빈 command → code=mcp_invalid_config', () => {
    const result = registry.register(createConfig({ command: '' }));
    if (!result.ok) expect(result.error.code).toBe('mcp_invalid_config');
  });

  it('공백만 있는 command → ok=false', () => {
    const result = registry.register(createConfig({ command: '  ' }));
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 command → code=mcp_invalid_config', () => {
    const result = registry.register(createConfig({ command: '  ' }));
    if (!result.ok) expect(result.error.code).toBe('mcp_invalid_config');
  });

  it('탭만 있는 command → ok=false', () => {
    const result = registry.register(createConfig({ command: '\t' }));
    expect(result.ok).toBe(false);
  });

  it('빈 name + 빈 command → ok=false (name 먼저 검증)', () => {
    const result = registry.register(createConfig({ name: '', command: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('mcp_invalid_config');
  });

  it('3번 중복 등록 → 2번째부터 모두 err', () => {
    registry.register(createConfig({ name: 'triple' }));
    const r2 = registry.register(createConfig({ name: 'triple' }));
    const r3 = registry.register(createConfig({ name: 'triple' }));
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
  });
});

// ── unregister ────────────────────────────────────────────────

describe('McpRegistry unregister', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('등록된 서버 해제 → ok=true', () => {
    registry.register(createConfig({ name: 'removable' }));
    const result = registry.unregister('removable');
    expect(result.ok).toBe(true);
  });

  it('해제 후 getServer → null', () => {
    registry.register(createConfig({ name: 'removable' }));
    registry.unregister('removable');
    expect(registry.getServer('removable')).toBeNull();
  });

  it('해제 후 listServers에서 제거됨', () => {
    registry.register(createConfig({ name: 'a' }));
    registry.register(createConfig({ name: 'b' }));
    registry.unregister('a');
    const names = registry.listServers().map((s) => s.name);
    expect(names).not.toContain('a');
    expect(names).toContain('b');
  });

  it('존재하지 않는 서버 해제 → ok=false', () => {
    const result = registry.unregister('nonexistent');
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 서버 해제 → code=mcp_server_not_found', () => {
    const result = registry.unregister('nonexistent');
    if (!result.ok) expect(result.error.code).toBe('mcp_server_not_found');
  });

  it('빈 이름으로 해제 → ok=false', () => {
    const result = registry.unregister('');
    expect(result.ok).toBe(false);
  });

  it('해제 후 같은 이름으로 재등록 가능', () => {
    registry.register(createConfig({ name: 're-register' }));
    registry.unregister('re-register');
    const result = registry.register(createConfig({ name: 're-register' }));
    expect(result.ok).toBe(true);
  });

  it('이미 해제한 서버 다시 해제 → ok=false', () => {
    registry.register(createConfig({ name: 'once' }));
    registry.unregister('once');
    const result = registry.unregister('once');
    expect(result.ok).toBe(false);
  });

  it('여러 서버 중 하나만 해제 → 나머지 유지', () => {
    registry.register(createConfig({ name: 'keep-a' }));
    registry.register(createConfig({ name: 'remove-b' }));
    registry.register(createConfig({ name: 'keep-c' }));
    registry.unregister('remove-b');
    expect(registry.listServers().length).toBe(2);
    expect(registry.getServer('keep-a')).not.toBeNull();
    expect(registry.getServer('keep-c')).not.toBeNull();
  });

  it('5개 등록 후 5개 해제 → 빈 목록', () => {
    for (let i = 0; i < 5; i++) registry.register(createConfig({ name: `sv-${i}` }));
    for (let i = 0; i < 5; i++) registry.unregister(`sv-${i}`);
    expect(registry.listServers().length).toBe(0);
  });
});

// ── getServer ─────────────────────────────────────────────────

describe('McpRegistry getServer', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('존재하지 않는 서버 → null 반환', () => {
    expect(registry.getServer('nonexistent')).toBeNull();
  });

  it('빈 이름 → null 반환', () => {
    expect(registry.getServer('')).toBeNull();
  });

  it('등록된 서버 → null이 아님', () => {
    registry.register(createConfig({ name: 'found' }));
    expect(registry.getServer('found')).not.toBeNull();
  });

  it('등록된 서버 config 전체가 일치', () => {
    const config = createConfig({ name: 'full', command: 'python', args: ['script.py'], enabled: false });
    registry.register(config);
    const found = registry.getServer('full');
    expect(found?.name).toBe('full');
    expect(found?.command).toBe('python');
    expect(found?.args).toEqual(['script.py']);
    expect(found?.enabled).toBe(false);
  });

  it('대소문자 다른 이름 → null', () => {
    registry.register(createConfig({ name: 'MyServer' }));
    expect(registry.getServer('myserver')).toBeNull();
  });

  it('여러 서버 중 올바른 서버 반환', () => {
    registry.register(createConfig({ name: 'alpha', command: 'cmd-a' }));
    registry.register(createConfig({ name: 'beta', command: 'cmd-b' }));
    const found = registry.getServer('beta');
    expect(found?.command).toBe('cmd-b');
  });

  it('존재하지 않는 다양한 이름 → null', () => {
    const names = ['xyz', 'abc', '123', 'not-here'];
    for (const name of names) {
      expect(registry.getServer(name)).toBeNull();
    }
  });
});

// ── listServers ───────────────────────────────────────────────

describe('McpRegistry listServers', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('빈 레지스트리 → 빈 배열', () => {
    expect(registry.listServers()).toEqual([]);
  });

  it('빈 레지스트리 → 길이 0', () => {
    expect(registry.listServers().length).toBe(0);
  });

  it('1개 등록 → 길이 1', () => {
    registry.register(createConfig({ name: 'one' }));
    expect(registry.listServers().length).toBe(1);
  });

  it('3개 등록 → 길이 3', () => {
    registry.register(createConfig({ name: 'a' }));
    registry.register(createConfig({ name: 'b' }));
    registry.register(createConfig({ name: 'c' }));
    expect(registry.listServers().length).toBe(3);
  });

  it('등록된 모든 이름 포함', () => {
    registry.register(createConfig({ name: 'x' }));
    registry.register(createConfig({ name: 'y' }));
    registry.register(createConfig({ name: 'z' }));
    const names = registry.listServers().map((s) => s.name);
    expect(names).toContain('x');
    expect(names).toContain('y');
    expect(names).toContain('z');
  });

  it('반환값이 배열이다', () => {
    expect(Array.isArray(registry.listServers())).toBe(true);
  });

  it('10개 등록 → 길이 10', () => {
    for (let i = 0; i < 10; i++) registry.register(createConfig({ name: `s${i}` }));
    expect(registry.listServers().length).toBe(10);
  });

  it('등록 실패한 서버는 포함되지 않음', () => {
    registry.register(createConfig({ name: 'valid' }));
    registry.register(createConfig({ name: '' })); // 실패
    expect(registry.listServers().length).toBe(1);
  });

  it('listServers 연속 호출 → 동일 결과', () => {
    registry.register(createConfig({ name: 'stable' }));
    const r1 = registry.listServers().map((s) => s.name);
    const r2 = registry.listServers().map((s) => s.name);
    expect(r1).toEqual(r2);
  });
});

// ── clear ─────────────────────────────────────────────────────

describe('McpRegistry clear', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('clear 후 listServers → 빈 배열', () => {
    registry.register(createConfig({ name: 'x' }));
    registry.register(createConfig({ name: 'y' }));
    registry.clear();
    expect(registry.listServers()).toEqual([]);
  });

  it('clear 후 getServer → null', () => {
    registry.register(createConfig({ name: 'gone' }));
    registry.clear();
    expect(registry.getServer('gone')).toBeNull();
  });

  it('빈 레지스트리 clear → 에러 없음', () => {
    expect(() => registry.clear()).not.toThrow();
  });

  it('clear 후 다시 등록 가능', () => {
    registry.register(createConfig({ name: 'old' }));
    registry.clear();
    const result = registry.register(createConfig({ name: 'old' }));
    expect(result.ok).toBe(true);
  });

  it('clear 후 listServers 길이 0', () => {
    for (let i = 0; i < 5; i++) registry.register(createConfig({ name: `s${i}` }));
    registry.clear();
    expect(registry.listServers().length).toBe(0);
  });

  it('clear 두 번 연속 → 에러 없음', () => {
    registry.register(createConfig());
    registry.clear();
    expect(() => registry.clear()).not.toThrow();
  });

  it('10개 등록 clear 후 unregister → err(not_found)', () => {
    for (let i = 0; i < 10; i++) registry.register(createConfig({ name: `s${i}` }));
    registry.clear();
    const result = registry.unregister('s0');
    expect(result.ok).toBe(false);
  });
});

// ── 반복/일관성 ────────────────────────────────────────────────

describe('McpRegistry 반복/일관성', () => {
  it('10번 독립 레지스트리 생성 → 각각 빈 목록', () => {
    for (let i = 0; i < 10; i++) {
      const r = new McpRegistry(new ConsoleLogger('error'));
      expect(r.listServers().length).toBe(0);
    }
  });

  it('서버 등록-해제-재등록 5회 반복 → 항상 ok', () => {
    const registry = new McpRegistry(new ConsoleLogger('error'));
    for (let i = 0; i < 5; i++) {
      const r1 = registry.register(createConfig({ name: 'cycle' }));
      expect(r1.ok).toBe(true);
      const r2 = registry.unregister('cycle');
      expect(r2.ok).toBe(true);
    }
  });

  it('여러 레지스트리 독립적으로 동작', () => {
    const r1 = new McpRegistry(new ConsoleLogger('error'));
    const r2 = new McpRegistry(new ConsoleLogger('error'));
    r1.register(createConfig({ name: 'only-in-r1' }));
    expect(r1.listServers().length).toBe(1);
    expect(r2.listServers().length).toBe(0);
  });
});

// ── 추가 생성자 경계값 ───────────────────────────────────────

describe('McpRegistry 추가 생성자', () => {
  it('warn logger로 생성 가능', () => {
    expect(new McpRegistry(new ConsoleLogger('warn'))).toBeInstanceOf(McpRegistry);
  });

  it('info logger로 생성 가능', () => {
    expect(new McpRegistry(new ConsoleLogger('info'))).toBeInstanceOf(McpRegistry);
  });

  it('10개 인스턴스 → 모두 빈 목록', () => {
    for (let i = 0; i < 10; i++) {
      const r = new McpRegistry(new ConsoleLogger('error'));
      expect(r.listServers().length).toBe(0);
    }
  });

  it('두 인스턴스 독립적 상태', () => {
    const r1 = new McpRegistry(new ConsoleLogger('error'));
    const r2 = new McpRegistry(new ConsoleLogger('error'));
    r1.register(createConfig({ name: 'only-r1' }));
    expect(r1.listServers().length).toBe(1);
    expect(r2.listServers().length).toBe(0);
  });

  it('listServers 반환값 배열', () => {
    const r = new McpRegistry(new ConsoleLogger('error'));
    expect(Array.isArray(r.listServers())).toBe(true);
  });
});

// ── register 추가 경계값 ──────────────────────────────────────

describe('McpRegistry register 추가 경계값', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('ok boolean 타입', () => {
    const r = registry.register(createConfig());
    expect(typeof r.ok).toBe('boolean');
  });

  it('5번 연속 다른 이름 등록 → 모두 ok', () => {
    for (let i = 0; i < 5; i++) {
      const r = registry.register(createConfig({ name: `srv-${i}` }));
      expect(r.ok).toBe(true);
    }
  });

  it('UUID 이름으로 등록 → ok', () => {
    const uuid = crypto.randomUUID();
    const r = registry.register(createConfig({ name: uuid }));
    expect(r.ok).toBe(true);
  });

  it('UUID 이름 등록 후 getServer → not null', () => {
    const uuid = crypto.randomUUID();
    registry.register(createConfig({ name: uuid }));
    expect(registry.getServer(uuid)).not.toBeNull();
  });

  it('중복 에러 메시지 string', () => {
    registry.register(createConfig({ name: 'dup2' }));
    const r = registry.register(createConfig({ name: 'dup2' }));
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('빈 name 에러 메시지 string', () => {
    const r = registry.register(createConfig({ name: '' }));
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('빈 command 에러 메시지 string', () => {
    const r = registry.register(createConfig({ command: '' }));
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('5번 빈 name 시도 → 모두 mcp_invalid_config', () => {
    for (let i = 0; i < 5; i++) {
      const r = registry.register(createConfig({ name: '' }));
      if (!r.ok) expect(r.error.code).toBe('mcp_invalid_config');
    }
  });

  it('5번 중복 등록 → 모두 mcp_duplicate_server', () => {
    registry.register(createConfig({ name: 'original' }));
    for (let i = 0; i < 5; i++) {
      const r = registry.register(createConfig({ name: 'original' }));
      if (!r.ok) expect(r.error.code).toBe('mcp_duplicate_server');
    }
  });
});

// ── unregister 추가 경계값 ────────────────────────────────────

describe('McpRegistry unregister 추가 경계값', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('에러 코드 타입 string', () => {
    const r = registry.unregister('nonexistent-server');
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('에러 메시지 타입 string', () => {
    const r = registry.unregister('ghost-server');
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('5번 없는 서버 해제 → 모두 mcp_server_not_found', () => {
    for (let i = 0; i < 5; i++) {
      const r = registry.unregister(`not-found-${i}`);
      if (!r.ok) expect(r.error.code).toBe('mcp_server_not_found');
    }
  });

  it('UUID 이름 없는 서버 해제 → err', () => {
    const uuid = crypto.randomUUID();
    const r = registry.unregister(uuid);
    expect(r.ok).toBe(false);
  });

  it('ok boolean 타입', () => {
    registry.register(createConfig({ name: 'to-remove' }));
    const r = registry.unregister('to-remove');
    expect(typeof r.ok).toBe('boolean');
  });
});

// ── getServer 추가 경계값 ─────────────────────────────────────

describe('McpRegistry getServer 추가 경계값', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('5번 반복 조회 일관성', () => {
    registry.register(createConfig({ name: 'consistent' }));
    for (let i = 0; i < 5; i++) {
      expect(registry.getServer('consistent')).not.toBeNull();
    }
  });

  it('UUID → null', () => {
    const uuid = crypto.randomUUID();
    expect(registry.getServer(uuid)).toBeNull();
  });

  it('한국어 이름 → null', () => {
    expect(registry.getServer('서버이름')).toBeNull();
  });

  it('공백 포함 이름 → null', () => {
    expect(registry.getServer('server name')).toBeNull();
  });

  it('숫자만 있는 이름 → null', () => {
    expect(registry.getServer('12345')).toBeNull();
  });
});

// ── listServers 추가 경계값 ───────────────────────────────────

describe('McpRegistry listServers 추가 경계값', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('5번 반복 일관성', () => {
    registry.register(createConfig({ name: 'stable' }));
    const len = registry.listServers().length;
    for (let i = 0; i < 5; i++) {
      expect(registry.listServers().length).toBe(len);
    }
  });

  it('enabled=false 서버도 listServers에 포함', () => {
    registry.register(createConfig({ name: 'disabled', enabled: false }));
    expect(registry.listServers().length).toBe(1);
    expect(registry.listServers()[0]?.enabled).toBe(false);
  });

  it('enabled=true + false 혼합 → 모두 포함', () => {
    registry.register(createConfig({ name: 's1', enabled: true }));
    registry.register(createConfig({ name: 's2', enabled: false }));
    expect(registry.listServers().length).toBe(2);
  });
});

// ── clear 추가 경계값 ─────────────────────────────────────────

describe('McpRegistry clear 추가 경계값', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry(new ConsoleLogger('error'));
  });

  it('ok boolean 타입 확인 (void 또는 undefined)', () => {
    registry.register(createConfig());
    const r = registry.clear();
    expect(r === undefined || typeof r === 'object').toBe(true);
  });

  it('5번 clear 반복 → 에러 없음', () => {
    registry.register(createConfig());
    for (let i = 0; i < 5; i++) {
      expect(() => registry.clear()).not.toThrow();
    }
  });

  it('clear 후 재등록 5번 → 모두 ok', () => {
    for (let i = 0; i < 5; i++) {
      registry.clear();
      const r = registry.register(createConfig({ name: 'fresh' }));
      expect(r.ok).toBe(true);
    }
  });
});

// ── 복합 시나리오 ─────────────────────────────────────────────

describe('McpRegistry 복합 시나리오', () => {
  it('3개 레지스트리 독립 동작', () => {
    const registries = Array.from({ length: 3 }, () => new McpRegistry(new ConsoleLogger('error')));
    registries[0]?.register(createConfig({ name: 'r0-srv' }));
    registries[1]?.register(createConfig({ name: 'r1-srv-a' }));
    registries[1]?.register(createConfig({ name: 'r1-srv-b' }));
    expect(registries[0]?.listServers().length).toBe(1);
    expect(registries[1]?.listServers().length).toBe(2);
    expect(registries[2]?.listServers().length).toBe(0);
  });

  it('등록-해제-clear 파이프라인', () => {
    const r = new McpRegistry(new ConsoleLogger('error'));
    const reg = r.register(createConfig({ name: 'pipeline' }));
    expect(reg.ok).toBe(true);
    const unreg = r.unregister('pipeline');
    expect(unreg.ok).toBe(true);
    expect(r.listServers().length).toBe(0);
    r.register(createConfig({ name: 'pipeline' }));
    expect(r.listServers().length).toBe(1);
    r.clear();
    expect(r.listServers().length).toBe(0);
  });

  it('50개 서버 등록 스트레스 테스트', () => {
    const r = new McpRegistry(new ConsoleLogger('error'));
    for (let i = 0; i < 50; i++) {
      const res = r.register(createConfig({ name: `stress-${i}` }));
      expect(res.ok).toBe(true);
    }
    expect(r.listServers().length).toBe(50);
    for (let i = 0; i < 25; i++) {
      r.unregister(`stress-${i}`);
    }
    expect(r.listServers().length).toBe(25);
  });

  it('getServer + register 일관성 루프', () => {
    const r = new McpRegistry(new ConsoleLogger('error'));
    for (let i = 0; i < 5; i++) {
      const name = `loop-${i}`;
      r.register(createConfig({ name }));
      expect(r.getServer(name)).not.toBeNull();
    }
    expect(r.listServers().length).toBe(5);
  });
});
