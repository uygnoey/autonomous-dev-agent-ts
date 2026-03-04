/**
 * adev auth 명령어 / adev auth command
 *
 * @description
 * KR: 인증 설정 및 재설정. API Key 또는 OAuth Token을 ~/.adev/.env에 저장한다.
 *     설치 시 또는 인증 만료 시 실행한다.
 * EN: Authentication setup and reset. Saves API Key or OAuth Token to ~/.adev/.env.
 *     Run during installation or when authentication expires.
 *
 * @example
 * adev auth           # 인증 설정 (대화형)
 * adev auth --status  # 현재 인증 상태 확인
 * adev auth --clear   # 인증 정보 삭제
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import inquirer from 'inquirer';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import { AuthError } from '../../core/errors.js';
import type { Result } from '../../core/types.js';

const ADEV_DIR = join(homedir(), '.adev');
const ENV_FILE = join(ADEV_DIR, '.env');

/**
 * 현재 인증 상태를 반환한다 / Returns current auth status
 */
async function getAuthStatus(): Promise<{ method: string; masked: string } | null> {
  if (!existsSync(ENV_FILE)) return null;

  const content = await readFile(ENV_FILE, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('ANTHROPIC_API_KEY=')) {
      const key = trimmed.slice('ANTHROPIC_API_KEY='.length);
      const masked = key.slice(0, 10) + '...' + key.slice(-4);
      return { method: 'API Key', masked };
    }
    if (trimmed.startsWith('CLAUDE_CODE_OAUTH_TOKEN=')) {
      const token = trimmed.slice('CLAUDE_CODE_OAUTH_TOKEN='.length);
      const masked = token.slice(0, 14) + '...' + token.slice(-4);
      return { method: 'OAuth Token', masked };
    }
  }
  return null;
}

/**
 * .env 파일에서 인증 키를 제거한다 / Remove auth keys from .env file
 */
async function clearAuthFromEnv(): Promise<void> {
  if (!existsSync(ENV_FILE)) return;

  const content = await readFile(ENV_FILE, 'utf-8');
  const filtered = content
    .split('\n')
    .filter((l) => !l.startsWith('ANTHROPIC_API_KEY=') && !l.startsWith('CLAUDE_CODE_OAUTH_TOKEN='))
    .join('\n');

  await writeFile(ENV_FILE, filtered, { mode: 0o600 });
}

/**
 * 인증 정보를 .env 파일에 저장한다 / Save auth credentials to .env file
 */
async function saveToEnv(key: string, value: string): Promise<void> {
  await mkdir(ADEV_DIR, { recursive: true });
  await clearAuthFromEnv();

  const existing = existsSync(ENV_FILE) ? await readFile(ENV_FILE, 'utf-8') : '';
  const newContent = existing.trimEnd() + (existing.trim() ? '\n' : '') + `${key}=${value}\n`;
  await writeFile(ENV_FILE, newContent, { mode: 0o600 });
}

/**
 * adev auth 명령어 핸들러 / adev auth command handler
 */
export class AuthCommand {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:auth' });
  }

  /**
   * auth 명령어를 실행한다 / Execute auth command
   *
   * @param args - 서브 인자 / Sub arguments
   * @param options - 옵션 / Options
   */
  async execute(
    args: string[],
    options: Record<string, unknown> = {},
  ): Promise<Result<void, AuthError>> {
    try {
      // --status: 현재 인증 상태 확인
      if (options['status']) {
        return this.showStatus();
      }

      // --clear: 인증 정보 삭제
      if (options['clear']) {
        return this.clearAuth();
      }

      // 대화형 인증 설정
      return this.setupAuth();
    } catch (error: unknown) {
      return err(new AuthError('auth_failed', `인증 설정 실패: ${String(error)}`, error));
    }
  }

  /**
   * 현재 인증 상태를 출력한다 / Print current auth status
   */
  private async showStatus(): Promise<Result<void, AuthError>> {
    const status = await getAuthStatus();
    if (status) {
      console.log(`\n✅ 인증 상태 / Auth Status`);
      console.log(`   방법 / Method: ${status.method}`);
      console.log(`   키 / Key:    ${status.masked}`);
      console.log(`   파일 / File: ${ENV_FILE}\n`);
    } else {
      console.log('\n⚠️  인증이 설정되지 않았습니다 / No authentication configured');
      console.log('   adev auth 를 실행하세요 / Run: adev auth\n');
    }
    return ok(undefined);
  }

  /**
   * 인증 정보를 삭제한다 / Clear authentication credentials
   */
  private async clearAuth(): Promise<Result<void, AuthError>> {
    const status = await getAuthStatus();
    if (!status) {
      console.log('\n⚠️  삭제할 인증 정보가 없습니다 / No auth credentials to clear\n');
      return ok(undefined);
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `${status.method} (${status.masked}) 인증 정보를 삭제하시겠습니까?`,
        default: false,
      },
    ]);

    if (confirmed) {
      await clearAuthFromEnv();
      console.log('\n✅ 인증 정보가 삭제되었습니다 / Auth credentials cleared\n');
    } else {
      console.log('\n취소되었습니다 / Cancelled\n');
    }
    return ok(undefined);
  }

  /**
   * 대화형 인증 설정 / Interactive auth setup
   */
  private async setupAuth(): Promise<Result<void, AuthError>> {
    const existing = await getAuthStatus();

    console.log('\n🔑 adev 인증 설정 / Authentication Setup\n');

    if (existing) {
      console.log(`   현재 설정 / Current: ${existing.method} (${existing.masked})`);
      console.log('');
    }

    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: '인증 방법을 선택하세요 / Choose authentication method:',
        choices: [
          {
            name: 'Anthropic API Key  (api.anthropic.com에서 발급)',
            value: 'apikey',
          },
          {
            name: 'Claude Code OAuth Token  (Pro/Max 구독자)',
            value: 'oauth',
          },
          { name: '취소 / Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (method === 'cancel') {
      console.log('\n취소되었습니다 / Cancelled\n');
      return ok(undefined);
    }

    if (method === 'apikey') {
      console.log('\n📘 API Key 발급: https://console.anthropic.com/settings/keys\n');

      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Anthropic API Key (sk-ant-...):',
          mask: '*',
          validate: (input: string) => {
            if (!input.trim()) return '❌ API Key를 입력하세요';
            if (!input.startsWith('sk-ant-')) return '❌ sk-ant- 로 시작해야 합니다';
            return true;
          },
        },
      ]);

      await saveToEnv('ANTHROPIC_API_KEY', apiKey.trim());
      this.logger.info('API Key 저장 완료');
      console.log(`\n✅ API Key 저장 완료 → ${ENV_FILE}\n`);
    } else {
      console.log('\n📘 OAuth Token 확인:');
      console.log('   cat ~/.claude/.credentials.json | grep oauthToken\n');

      const { oauthToken } = await inquirer.prompt([
        {
          type: 'password',
          name: 'oauthToken',
          message: 'Claude Code OAuth Token (sk-ant-oat01-...):',
          mask: '*',
          validate: (input: string) => {
            if (!input.trim()) return '❌ OAuth Token을 입력하세요';
            if (!input.startsWith('sk-ant-')) return '❌ sk-ant- 로 시작해야 합니다';
            return true;
          },
        },
      ]);

      await saveToEnv('CLAUDE_CODE_OAUTH_TOKEN', oauthToken.trim());
      this.logger.info('OAuth Token 저장 완료');
      console.log(`\n✅ OAuth Token 저장 완료 → ${ENV_FILE}\n`);
    }

    return ok(undefined);
  }

  /** 도움말 / Help text */
  help(): string {
    return [
      'adev auth — 인증 설정 / Authentication setup',
      '',
      '사용법 / Usage:',
      '  adev auth           인증 설정 (대화형) / Setup auth interactively',
      '  adev auth --status  현재 인증 상태 확인 / Show current auth status',
      '  adev auth --clear   인증 정보 삭제 / Clear credentials',
    ].join('\n');
  }
}
