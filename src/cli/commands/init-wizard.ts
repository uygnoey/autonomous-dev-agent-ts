/**
 * Init 위저드 — 사용자 입력 수집 / Init wizard — user input collection
 *
 * @description
 * KR: readline 기반 번호 선택 메뉴로 사용자 입력을 수집한다.
 *     inquirer v13 + Bun 조합의 list 렌더링 버그를 우회한다.
 * EN: Collects user input via readline-based numbered menu.
 *     Avoids inquirer v13 + Bun list rendering bug.
 */

import * as readline from 'node:readline';
import type { AuthMethod } from 'cli/types.js';
import { loadEnvironment } from 'core/config.js';
import { ConfigError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';

/** 번호 선택 메뉴 옵션 / Numbered menu option */
interface MenuOption<T extends string> {
  label: string;
  value: T;
}

/**
 * TTY 기반 번호 선택 메뉴를 표시하고 선택값을 반환한다
 * Display numbered selection menu and return chosen value
 *
 * WHY: inquirer v13 + Bun 환경에서 type:'list' 렌더링이 깨져 선택지가 안 보임.
 *      readline으로 직접 출력하면 모든 환경에서 안정적으로 동작한다.
 */
async function selectFromMenu<T extends string>(
  question: string,
  options: MenuOption<T>[],
  defaultIndex = 0,
): Promise<T> {
  process.stdout.write(`\n${question}\n`);
  for (const [i, opt] of options.entries()) {
    process.stdout.write(`  ${i + 1}) ${opt.label}\n`);
  }
  process.stdout.write(`\n선택 (1-${options.length}, 기본값: ${defaultIndex + 1}): `);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise<T>((resolve) => {
    rl.once('line', (line) => {
      rl.close();
      const trimmed = line.trim();
      if (trimmed === '') {
        resolve(options[defaultIndex]?.value as T);
        return;
      }
      const idx = Number.parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx]?.value as T);
      } else {
        // WHY: 범위 밖 입력 → 기본값으로 fallback
        resolve(options[defaultIndex]?.value as T);
      }
    });
  });
}

/**
 * 인증 방식을 선택한다 / Select authentication method
 *
 * @param interactive - 대화형 모드 여부 / Interactive mode
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 선택된 인증 방식 / Selected auth method
 */
export async function selectAuthMethod(
  interactive: boolean,
  logger: Logger,
): Promise<Result<AuthMethod, ConfigError>> {
  try {
    // WHY: non-TTY 환경(CI, 테스트)에서는 hang 방지 → 기본값 반환
    if (!(interactive && process.stdin.isTTY)) {
      return ok('api-key');
    }

    const authMethod = await selectFromMenu<AuthMethod>(
      '인증 방식을 선택하세요:',
      [
        { label: 'API key  (ANTHROPIC_API_KEY)', value: 'api-key' },
        { label: 'Subscription (CLAUDE_CODE_OAUTH_TOKEN)', value: 'subscription' },
      ],
      0,
    );

    logger.debug('인증 방식 선택됨', { authMethod });
    return ok(authMethod);
  } catch (cause) {
    const error = new ConfigError('cli_init_auth_select_failed', '인증 방식 선택 실패', cause);
    logger.error('인증 방식 선택 실패', { error });
    return err(error);
  }
}

/**
 * 토큰이 없을 때 사용자에게 직접 입력받아 ~/.adev/.env에 저장한다
 * Prompt user for token and save to ~/.adev/.env if not already set
 *
 * @param authMethod - 선택된 인증 방식 / Selected auth method
 * @param logger - 로거 인스턴스 / Logger instance
 */
export async function promptAndSaveToken(
  authMethod: AuthMethod,
  logger: Logger,
  interactive = true,
): Promise<Result<void, ConfigError>> {
  if (!(interactive && process.stdin.isTTY && process.stdout.isTTY)) {
    return ok(undefined);
  }

  const { mkdir, writeFile, readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');

  const envVar = authMethod === 'api-key' ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN';
  const hint = authMethod === 'api-key' ? 'sk-ant-api...' : 'sk-ant-oat01-...';
  const guide =
    authMethod === 'api-key'
      ? '  📘 발급: https://console.anthropic.com/settings/keys'
      : '  📘 확인: cat ~/.claude/.credentials.json | grep oauthToken';

  process.stdout.write(`\n${guide}\n`);

  // WHY: 올바른 형식이 입력될 때까지 재시도. 빈 입력은 건너뜀(skip) 허용.
  const { createInterface } = await import('node:readline');
  let token = '';
  while (true) {
    process.stdout.write(`${envVar} (${hint}, 엔터=건너뜀): `);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const input = await new Promise<string>((resolve) => {
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
    });

    if (!input) {
      process.stdout.write('\n⚠️  건너뜁니다. 나중에 adev auth 명령어로 설정하세요.\n\n');
      return ok(undefined);
    }

    if (!input.startsWith('sk-ant-')) {
      process.stdout.write(
        '❌ 올바르지 않은 형식입니다. sk-ant- 로 시작해야 합니다. 다시 입력하세요.\n',
      );
      continue;
    }

    token = input;
    break;
  }

  try {
    const adevDir = join(homedir(), '.adev');
    const envFile = join(adevDir, '.env');

    await mkdir(adevDir, { recursive: true });

    // 기존 .env 내용 유지하며 해당 키만 추가/교체
    let existing = '';
    if (existsSync(envFile)) {
      existing = await readFile(envFile, 'utf-8');
    }
    const lines = existing.split('\n').filter((l) => !l.startsWith(`${envVar}=`));
    lines.push(`${envVar}=${token}`);
    await writeFile(envFile, `${lines.filter(Boolean).join('\n')}\n`, 'utf-8');

    process.stdout.write(`\n✅ ${envVar} 저장 완료 → ${envFile}\n\n`);
    logger.debug('토큰 저장 완료', { envVar, envFile });
    return ok(undefined);
  } catch (cause) {
    return err(new ConfigError('cli_init_token_save_failed', '토큰 저장 실패', cause));
  }
}

/**
 * 환경변수를 확인한다 / Check environment variables
 *
 * @param authMethod - 인증 방식 / Auth method
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 환경변수 존재 여부 / Whether env var exists
 */
export async function checkEnvVar(
  authMethod: AuthMethod,
  logger: Logger,
): Promise<Result<boolean, ConfigError>> {
  try {
    // WHY: process.env 직접 접근 금지 → core/config.ts의 loadEnvironment() 경유
    const envResult = loadEnvironment();
    if (!envResult.ok) {
      // WHY: 환경변수가 없으면 false 반환 (에러가 아닌 체크 목적)
      logger.debug('환경변수 미설정', { authMethod });
      return ok(false);
    }

    const envVar = authMethod === 'api-key' ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN';
    const exists =
      authMethod === 'api-key'
        ? envResult.value.anthropicApiKey !== undefined
        : envResult.value.claudeCodeOauthToken !== undefined;

    logger.debug('환경변수 확인', { envVar, exists });

    return ok(exists);
  } catch (cause) {
    const error = new ConfigError('cli_init_env_check_failed', '환경변수 확인 실패', cause);
    return err(error);
  }
}
