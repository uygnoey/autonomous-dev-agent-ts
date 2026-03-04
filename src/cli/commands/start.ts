/**
 * start 명령 / Start command
 *
 * @description
 * KR: layer1 대화를 시작하기 위한 설정과 인증을 준비한다.
 * EN: Prepares configuration and authentication to start layer1 conversation.
 */

import { resolve } from 'node:path';
import { createAuthProvider } from '../../auth/index.js';
import { loadConfig } from '../../core/config.js';
import { AdevError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import type { CliCommand, CliOptions } from '../types.js';

// ── StartCommand ───────────────────────────────────────────────

/**
 * layer1 대화 시작 명령 / Start layer1 conversation command
 *
 * @description
 * KR: 설정을 로드하고, 인증 공급자를 생성하여 대화 시작 준비를 완료한다.
 *     실제 대화 루프는 이 명령의 범위 밖이다.
 * EN: Loads config, creates auth provider, and completes conversation start preparation.
 *     The actual conversation loop is outside this command's scope.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const cmd = new StartCommand(logger);
 * const result = await cmd.execute([], { flags: {} });
 */
export class StartCommand implements CliCommand {
  readonly name = 'start';
  readonly description = 'Start layer1 conversation / layer1 대화 시작';
  readonly aliases = ['s'] as const;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:start' });
  }

  /**
   * start 명령 실행 / Execute start command
   *
   * @param _args - 위치 인자 (미사용) / Positional args (unused)
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(_args: readonly string[], options: CliOptions): Promise<Result<void, AdevError>> {
    const projectPath = resolve(options.projectPath ?? '.');

    this.logger.info('layer1 대화 준비 시작 / Preparing layer1 conversation', { projectPath });

    // .adev/ 디렉토리 존재 확인 / Verify .adev/ directory exists
    const configFile = Bun.file(resolve(projectPath, '.adev', 'config.json'));
    if (!(await configFile.exists())) {
      return err(
        new AdevError(
          'cli_start_not_initialized',
          '프로젝트가 초기화되지 않았습니다. 먼저 `adev init`을 실행하세요.',
        ),
      );
    }

    // 설정 로드 / Load config
    const configResult = await loadConfig(projectPath);
    if (!configResult.ok) {
      return err(
        new AdevError(
          'cli_start_config_failed',
          `설정 로드 실패: ${configResult.error.message}`,
          configResult.error,
        ),
      );
    }

    // 인증 공급자 생성 / Create auth provider
    const authResult = createAuthProvider(this.logger);
    if (!authResult.ok) {
      return err(
        new AdevError(
          'cli_start_auth_failed',
          `인증 공급자 생성 실패: ${authResult.error.message}`,
          authResult.error,
        ),
      );
    }

    this.logger.info('layer1 대화 준비 완료 / Layer1 conversation ready', {
      projectPath,
      authMode: authResult.value.authMode,
    });

    return ok(undefined);
  }
}
