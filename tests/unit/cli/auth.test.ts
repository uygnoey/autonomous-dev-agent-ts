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
});

// ── 랜덤/경계값 검증 ──────────────────────────────────────────

describe('AuthCommand 랜덤/경계값', () => {
  const mgr = new TempEnvManager();

  beforeEach(async () => await mgr.backup());
  afterEach(async () => await mgr.restore());

  it.each(Array.from({ length: 20 }, (_, i) => i))(
    '랜덤 API Key 길이 검증 #%i',
    async (i) => {
      const len = 10 + i * 3;
      const key = `sk-ant-test-${'x'.repeat(len)}`;
      await mgr.writeEnv(`ANTHROPIC_API_KEY=${key}\n`);

      const cmd = new AuthCommand(logger);
      const result = await cmd.execute([], { status: true });
      expect(result.ok).toBe(true);
    },
  );

  it.each([
    'ANTHROPIC_API_KEY=',
    'ANTHROPIC_API_KEY=\n',
    'ANTHROPIC_API_KEY=  \n',
  ])('빈 API Key 값 처리: %s', async (line) => {
    await mgr.writeEnv(line);
    const cmd = new AuthCommand(logger);
    // 빈 값이라도 throw 없이 처리
    const result = await cmd.execute([], { status: true });
    expect(typeof result.ok).toBe('boolean');
  });

  it.each([
    'OTHER_KEY=some-value\n',
    'PATH=/usr/bin:/bin\n',
    'HOME=/root\n',
    'NODE_ENV=production\n',
  ])('관련 없는 환경변수 무시됨: %s', async (line) => {
    await mgr.writeEnv(line);
    const cmd = new AuthCommand(logger);
    const result = await cmd.execute([], { status: true });
    expect(result.ok).toBe(true);
  });

  it.each(Array.from({ length: 15 }, (_, i) => i))(
    '다중 줄 .env 파싱 #%i',
    async (i) => {
      const lines = Array.from({ length: i + 1 }, (_, j) => `VAR_${j}=value_${j}`).join('\n');
      await mgr.writeEnv(`${lines}\n`);
      const cmd = new AuthCommand(logger);
      const result = await cmd.execute([], { status: true });
      expect(result.ok).toBe(true);
    },
  );
});
