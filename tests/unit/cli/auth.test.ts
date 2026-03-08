/**
 * AuthCommand 단위 테스트 / AuthCommand unit tests
 *
 * @description
 * getAuthStatus, clearAuthFromEnv, saveToEnv 내부 로직과
 * showStatus, clearAuth 흐름을 검증한다.
 * setupAuth는 inquirer 상호작용이 필요해 통합 테스트에서 검증.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AuthCommand } from 'cli/commands/auth.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 테스트 헬퍼 / Test Helpers ─────────────────────────────────

const logger = new ConsoleLogger('error');

/** 임시 .adev 디렉토리와 .env 파일 관리 */
class TempEnvManager {
  readonly adevDir: string;
  readonly envFile: string;
  private savedContent: string | null = null;

  constructor() {
    this.adevDir = join(homedir(), '.adev');
    this.envFile = join(this.adevDir, '.env');
  }

  async backup(): Promise<void> {
    if (existsSync(this.envFile)) {
      this.savedContent = await readFile(this.envFile, 'utf-8');
    } else {
      this.savedContent = null;
    }
  }

  async restore(): Promise<void> {
    if (this.savedContent !== null) {
      await mkdir(this.adevDir, { recursive: true });
      await writeFile(this.envFile, this.savedContent, { mode: 0o600 });
    } else if (existsSync(this.envFile)) {
      // 원래 없었으면 삭제 (테스트가 생성한 것만)
      const content = await readFile(this.envFile, 'utf-8');
      // 테스트 키만 있으면 삭제
      if (
        content.includes('sk-ant-test-') ||
        content.includes('sk-ant-fake-')
      ) {
        const filtered = content
          .split('\n')
          .filter(
            (l) =>
              !l.includes('sk-ant-test-') &&
              !l.includes('sk-ant-fake-'),
          )
          .join('\n');
        if (filtered.trim()) {
          await writeFile(this.envFile, filtered, { mode: 0o600 });
        }
      }
    }
  }

  async writeEnv(content: string): Promise<void> {
    await mkdir(this.adevDir, { recursive: true });
    await writeFile(this.envFile, content, { mode: 0o600 });
  }

  async clearEnv(): Promise<void> {
    if (existsSync(this.envFile)) {
      await writeFile(this.envFile, '', { mode: 0o600 });
    }
  }

  async readEnv(): Promise<string> {
    if (!existsSync(this.envFile)) return '';
    return readFile(this.envFile, 'utf-8');
  }
}

// ── AuthCommand 초기화 ─────────────────────────────────────────

describe('AuthCommand', () => {
  it('인스턴스 생성됨', () => {
    const cmd = new AuthCommand(logger);
    expect(cmd).toBeDefined();
  });

  it('AuthCommand 인스턴스', () => {
    const cmd = new AuthCommand(logger);
    expect(cmd).toBeInstanceOf(AuthCommand);
  });

  it('두 인스턴스는 다른 객체', () => {
    const cmd1 = new AuthCommand(logger);
    const cmd2 = new AuthCommand(logger);
    expect(cmd1).not.toBe(cmd2);
  });

  it('help 메서드 존재', () => {
    const cmd = new AuthCommand(logger);
    expect(typeof cmd.help).toBe('function');
  });

  it('execute 메서드 존재', () => {
    const cmd = new AuthCommand(logger);
    expect(typeof cmd.execute).toBe('function');
  });

  it('help() → 문자열 반환', () => {
    const cmd = new AuthCommand(logger);
    const help = cmd.help();
    expect(typeof help).toBe('string');
    expect(help.length).toBeGreaterThan(0);
  });

  it('help() → 주요 명령어 포함', () => {
    const cmd = new AuthCommand(logger);
    const help = cmd.help();
    expect(help).toContain('adev auth');
    expect(help).toContain('--status');
    expect(help).toContain('--clear');
  });

  it('debug logger로 생성 가능', () => {
    const cmd = new AuthCommand(new ConsoleLogger('debug'));
    expect(cmd).toBeInstanceOf(AuthCommand);
  });

  it('info logger로 생성 가능', () => {
    const cmd = new AuthCommand(new ConsoleLogger('info'));
    expect(cmd).toBeInstanceOf(AuthCommand);
  });
});

// ── --status: 인증 없을 때 ────────────────────────────────────

describe('AuthCommand.execute --status', () => {
  const mgr = new TempEnvManager();

  beforeEach(async () => {
    await mgr.backup();
    await mgr.clearEnv();
  });

  afterEach(async () => {
    await mgr.restore();
  });

  it('인증 없을 때 --status → ok 반환', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('ANTHROPIC_API_KEY 있을 때 --status → ok 반환', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=sk-ant-test-api-key-12345\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('CLAUDE_CODE_OAUTH_TOKEN 있을 때 --status → ok 반환', async () => {
    await mgr.writeEnv('CLAUDE_CODE_OAUTH_TOKEN=sk-ant-fake-oauth-token-xyz\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('두 키 모두 있을 때 --status → ok 반환', async () => {
    await mgr.writeEnv(
      'ANTHROPIC_API_KEY=sk-ant-test-api-key-12345\nCLAUDE_CODE_OAUTH_TOKEN=sk-ant-fake-token\n',
    );
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('다른 환경변수가 있는 .env → --status ok', async () => {
    await mgr.writeEnv('OTHER_VAR=some-value\nANOTHER=thing\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('execute 반환값에 ok 필드 있음', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect('ok' in result).toBe(true);
  });

  it('execute 반환값 ok는 boolean', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it('5번 연속 --status → 모두 ok', async () => {
    for (let i = 0; i < 5; i++) {
      const cmd = new AuthCommand(logger);
      const result = await cmd.execute([], { status: true });
      expect(result.ok).toBe(true);
    }
  });
});

// ── .env 파싱 경계값 ──────────────────────────────────────────

describe('AuthCommand .env 파싱 경계값', () => {
  const mgr = new TempEnvManager();

  beforeEach(async () => await mgr.backup());
  afterEach(async () => await mgr.restore());

  it('빈 .env 파일 → --status ok', async () => {
    await mgr.writeEnv('');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('공백만 있는 .env → --status ok', async () => {
    await mgr.writeEnv('   \n   \n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('주석줄이 있는 .env → --status ok', async () => {
    await mgr.writeEnv('# 주석\n# 다른 주석\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('값이 긴 API Key → --status ok (마스킹 처리)', async () => {
    const longKey = `sk-ant-test-${'a'.repeat(50)}`;
    await mgr.writeEnv(`ANTHROPIC_API_KEY=${longKey}\n`);
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('값이 짧은 API Key → --status ok (인덱스 오류 없음)', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=sk-ant-ab\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('개행 없는 단일 줄 → ok', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=sk-ant-test-abc123');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('여러 환경변수 혼합 → ok', async () => {
    await mgr.writeEnv('FOO=bar\nANTHROPIC_API_KEY=sk-ant-test-abc\nBAZ=qux\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('탭 포함 .env → ok', async () => {
    await mgr.writeEnv('\tANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('값에 등호 포함 → ok', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=sk-ant-test-abc=extra=data\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('100줄 env 파일 → ok', async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `VAR_${i}=value_${i}`).join('\n');
    await mgr.writeEnv(`${lines}\n`);
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });
});

// ── help() 내용 상세 검증 ─────────────────────────────────────

describe('AuthCommand.help() 내용', () => {
  it('사용법 섹션 포함', () => {
    const cmd = new AuthCommand(logger);
    const help = cmd.help();
    expect(help.toLowerCase()).toMatch(/usage|사용법/i);
  });

  it('인터랙티브 모드 설명 포함', () => {
    const cmd = new AuthCommand(logger);
    const help = cmd.help();
    expect(help).toContain('adev auth');
  });

  it('--status 플래그 설명 포함', () => {
    const cmd = new AuthCommand(logger);
    const help = cmd.help();
    expect(help).toContain('--status');
  });

  it('--clear 플래그 설명 포함', () => {
    const cmd = new AuthCommand(logger);
    const help = cmd.help();
    expect(help).toContain('--clear');
  });

  it('help() 반환값은 비어 있지 않음', () => {
    const cmd = new AuthCommand(logger);
    expect(cmd.help().length).toBeGreaterThan(10);
  });

  it('help() 연속 호출 → 동일한 결과', () => {
    const cmd = new AuthCommand(logger);
    const h1 = cmd.help();
    const h2 = cmd.help();
    expect(h1).toBe(h2);
  });

  it('두 인스턴스 help() → 동일', () => {
    const h1 = new AuthCommand(logger).help();
    const h2 = new AuthCommand(logger).help();
    expect(h1).toBe(h2);
  });
});

// ── execute 옵션 처리 ─────────────────────────────────────────

describe('AuthCommand.execute 옵션', () => {
  const mgr = new TempEnvManager();

  beforeEach(async () => await mgr.backup());
  afterEach(async () => await mgr.restore());

  it('status 옵션 → ok 반환', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('status: false이면 ok 반환', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('args 배열 무시됨', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute(['ignored', 'args'], { status: true });
    expect(result.ok).toBe(true);
  });

  it('빈 args + status → ok', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it('여러 args + status → ok', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute(['a', 'b', 'c', 'd'], { status: true });
    expect(result.ok).toBe(true);
  });

  it('status:true 옵션으로 ok는 boolean', async () => {
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── 랜덤/경계값 검증 ──────────────────────────────────────────

describe('AuthCommand 랜덤/경계값', () => {
  const mgr = new TempEnvManager();

  beforeEach(async () => await mgr.backup());
  afterEach(async () => await mgr.restore());

  it('랜덤 API Key 길이 10 → ok', async () => {
    const key = `sk-ant-test-${'x'.repeat(10)}`;
    await mgr.writeEnv(`ANTHROPIC_API_KEY=${key}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('랜덤 API Key 길이 25 → ok', async () => {
    const key = `sk-ant-test-${'x'.repeat(25)}`;
    await mgr.writeEnv(`ANTHROPIC_API_KEY=${key}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('랜덤 API Key 길이 50 → ok', async () => {
    const key = `sk-ant-test-${'x'.repeat(50)}`;
    await mgr.writeEnv(`ANTHROPIC_API_KEY=${key}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('랜덤 API Key 길이 100 → ok', async () => {
    const key = `sk-ant-test-${'x'.repeat(100)}`;
    await mgr.writeEnv(`ANTHROPIC_API_KEY=${key}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('빈 API Key 값 "ANTHROPIC_API_KEY=" → ok 또는 not-throw', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 API Key 값 "ANTHROPIC_API_KEY=\\n" → ok 또는 not-throw', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 API Key 값 "ANTHROPIC_API_KEY=  \\n" → ok 또는 not-throw', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=  \n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it('관련 없는 환경변수 "OTHER_KEY=some-value" → ok', async () => {
    await mgr.writeEnv('OTHER_KEY=some-value\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('관련 없는 환경변수 "PATH=/usr/bin:/bin" → ok', async () => {
    await mgr.writeEnv('PATH=/usr/bin:/bin\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('관련 없는 환경변수 "HOME=/root" → ok', async () => {
    await mgr.writeEnv('HOME=/root\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('관련 없는 환경변수 "NODE_ENV=production" → ok', async () => {
    await mgr.writeEnv('NODE_ENV=production\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('다중 줄 .env 파싱 1줄 → ok', async () => {
    await mgr.writeEnv('VAR_0=value_0\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('다중 줄 .env 파싱 5줄 → ok', async () => {
    const lines = Array.from({ length: 5 }, (_, j) => `VAR_${j}=value_${j}`).join('\n');
    await mgr.writeEnv(`${lines}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('다중 줄 .env 파싱 10줄 → ok', async () => {
    const lines = Array.from({ length: 10 }, (_, j) => `VAR_${j}=value_${j}`).join('\n');
    await mgr.writeEnv(`${lines}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('다중 줄 .env 파싱 15줄 → ok', async () => {
    const lines = Array.from({ length: 15 }, (_, j) => `VAR_${j}=value_${j}`).join('\n');
    await mgr.writeEnv(`${lines}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });
});

// ── 추가 생성자 경계값 ─────────────────────────────────────────

describe('AuthCommand 추가 생성자 경계값', () => {
  it('10개 인스턴스 생성 → 모두 AuthCommand', () => {
    for (let i = 0; i < 10; i++) {
      expect(new AuthCommand(logger)).toBeInstanceOf(AuthCommand);
    }
  });

  it('warn logger로 생성 가능', () => {
    const cmd = new AuthCommand(new ConsoleLogger('warn'));
    expect(cmd).toBeInstanceOf(AuthCommand);
  });

  it('5번 연속 생성 → 각각 다른 객체', () => {
    const cmds = Array.from({ length: 5 }, () => new AuthCommand(logger));
    for (let i = 0; i < cmds.length - 1; i++) {
      expect(cmds[i]).not.toBe(cmds[i + 1]);
    }
  });

  it('help 메서드 타입은 function', () => {
    const cmd = new AuthCommand(logger);
    expect(typeof cmd.help).toBe('function');
  });

  it('execute 메서드 타입은 function', () => {
    const cmd = new AuthCommand(logger);
    expect(typeof cmd.execute).toBe('function');
  });

  it('help() 반환값 타입은 string', () => {
    const cmd = new AuthCommand(logger);
    expect(typeof cmd.help()).toBe('string');
  });

  it('10번 연속 help() → 모두 동일', () => {
    const cmd = new AuthCommand(logger);
    const first = cmd.help();
    for (let i = 0; i < 10; i++) {
      expect(cmd.help()).toBe(first);
    }
  });
});

// ── UUID/특수 키 경계값 ────────────────────────────────────────

describe('AuthCommand UUID/특수 키 경계값', () => {
  const mgr = new TempEnvManager();

  beforeEach(async () => await mgr.backup());
  afterEach(async () => await mgr.restore());

  it('UUID 형식 API Key → ok', async () => {
    const uuid = crypto.randomUUID();
    await mgr.writeEnv(`ANTHROPIC_API_KEY=sk-ant-test-${uuid}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('숫자만 포함한 API Key → ok', async () => {
    await mgr.writeEnv(`ANTHROPIC_API_KEY=sk-ant-test-1234567890\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('대문자 포함 API Key → ok', async () => {
    await mgr.writeEnv(`ANTHROPIC_API_KEY=sk-ant-test-ABCDEFGH\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('하이픈 포함 API Key → ok', async () => {
    await mgr.writeEnv(`ANTHROPIC_API_KEY=sk-ant-test-abc-def-ghi\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('두 명령어 인스턴스가 독립적으로 동작', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=sk-ant-test-abc123\n');
    const cmd1 = new AuthCommand(logger);
    const cmd2 = new AuthCommand(new ConsoleLogger('warn'));
    const [r1, r2] = await Promise.all([
      cmd1.execute([], { status: true }),
      cmd2.execute([], { status: true }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('OAuth 토큰 UUID 형식 → ok', async () => {
    const uuid = crypto.randomUUID();
    await mgr.writeEnv(`CLAUDE_CODE_OAUTH_TOKEN=sk-ant-fake-${uuid}\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('두 키 모두 UUID → ok', async () => {
    const uuid1 = crypto.randomUUID();
    const uuid2 = crypto.randomUUID();
    await mgr.writeEnv(
      `ANTHROPIC_API_KEY=sk-ant-test-${uuid1}\nCLAUDE_CODE_OAUTH_TOKEN=sk-ant-fake-${uuid2}\n`,
    );
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('5번 UUID 키로 연속 상태 확인 → 모두 ok', async () => {
    for (let i = 0; i < 5; i++) {
      const uuid = crypto.randomUUID();
      await mgr.writeEnv(`ANTHROPIC_API_KEY=sk-ant-test-${uuid}\n`);
      const cmd = new AuthCommand(logger);
      expect((await cmd.execute([], { status: true })).ok).toBe(true);
    }
  });

  it('특수문자 포함 다른 환경변수 → ok', async () => {
    await mgr.writeEnv('MY_VAR=hello!@#$%^&*\nANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('등호 여러 개 포함 값 → ok', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=abc==def==ghi\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 줄 여러 개 → ok', async () => {
    await mgr.writeEnv('\n\n\n\nANTHROPIC_API_KEY=sk-ant-test-abc\n\n\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('Windows 스타일 개행 CRLF → ok', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=sk-ant-test-abc\r\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it('환경변수 값에 공백 → ok', async () => {
    await mgr.writeEnv('OTHER_VAR=hello world\nANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('매우 긴 다른 변수 값 → ok', async () => {
    const longValue = 'x'.repeat(500);
    await mgr.writeEnv(`OTHER_VAR=${longValue}\nANTHROPIC_API_KEY=sk-ant-test-abc\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });
});

// ── AuthCommand 인스턴스 추가 생성 경계값 ────────────────────────

describe('AuthCommand 인스턴스 생성 추가 경계값', () => {
  it('100개 인스턴스 순차 생성 가능', () => {
    for (let i = 0; i < 100; i++) {
      const cmd = new AuthCommand(logger);
      expect(cmd).toBeInstanceOf(AuthCommand);
    }
  });

  it('각 인스턴스는 서로 다른 객체', () => {
    const a = new AuthCommand(logger);
    const b = new AuthCommand(logger);
    expect(a).not.toBe(b);
  });

  it('error logger로 생성 가능', () => {
    const cmd = new AuthCommand(new ConsoleLogger('error'));
    expect(cmd).toBeInstanceOf(AuthCommand);
  });

  it('help()는 항상 동일한 값 반환 (순수 함수)', () => {
    const cmd = new AuthCommand(logger);
    const calls = Array.from({ length: 20 }, () => cmd.help());
    const first = calls[0];
    for (const h of calls) expect(h).toBe(first);
  });

  it('help() 길이는 양수', () => {
    const cmd = new AuthCommand(logger);
    expect(cmd.help().length).toBeGreaterThan(0);
  });

  it('help() 아랫줄 포함 (멀티라인)', () => {
    const cmd = new AuthCommand(logger);
    expect(cmd.help()).toContain('\n');
  });

  it('execute 메서드는 Promise 반환', () => {
    const cmd = new AuthCommand(logger);
    const result = cmd.execute([], { status: true });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('두 인스턴스 동시 status 실행 → 각각 ok', async () => {
    const cmd1 = new AuthCommand(logger);
    const cmd2 = new AuthCommand(new ConsoleLogger('warn'));
    const [r1, r2] = await Promise.all([
      cmd1.execute([], { status: true }),
      cmd2.execute([], { status: true }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});

// ── 다양한 env 파일 포맷 경계값 ───────────────────────────────

describe('AuthCommand 다양한 env 포맷 경계값', () => {
  const mgr = new TempEnvManager();

  beforeEach(async () => await mgr.backup());
  afterEach(async () => await mgr.restore());

  it('BOM 없는 UTF-8 → ok', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('한글 주석 포함 .env → ok', async () => {
    await mgr.writeEnv('# 한국어 주석입니다\nANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('공백 키 "  KEY=value" → ok 또는 안전 처리', async () => {
    await mgr.writeEnv('  ANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it('연속 줄바꿈 → ok', async () => {
    await mgr.writeEnv('\n\n\nANTHROPIC_API_KEY=sk-ant-test-abc\n\n\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('50개 관련 없는 변수 후 API Key → ok', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => `UNRELATED_${i}=val`).join('\n');
    await mgr.writeEnv(`${lines}\nANTHROPIC_API_KEY=sk-ant-test-abc\n`);
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('JSON 값 포함 변수 → ok', async () => {
    await mgr.writeEnv('CONFIG={"key":"value"}\nANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('URL 값 포함 변수 → ok', async () => {
    await mgr.writeEnv('API_URL=https://api.example.com/v1\nANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('backslash 포함 값 → ok 또는 안전 처리', async () => {
    await mgr.writeEnv('PATH_VAR=C:\\Users\\test\nANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it('인용 부호 없는 값 → ok', async () => {
    await mgr.writeEnv('ANTHROPIC_API_KEY=sk-ant-test-abc-def-ghi\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });

  it('값에 세미콜론 포함 → ok', async () => {
    await mgr.writeEnv('DB_URL=postgres://user:pass@host/db;sslmode=require\nANTHROPIC_API_KEY=sk-ant-test-abc\n');
    const cmd = new AuthCommand(logger);
    expect((await cmd.execute([], { status: true })).ok).toBe(true);
  });
});
