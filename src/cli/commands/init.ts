/**
 * init 명령 / Init command
 *
 * @description
 * KR: 프로젝트에 .adev/ 디렉토리 구조를 생성하고 기본 설정 파일을 초기화한다.
 * EN: Creates .adev/ directory structure and initializes default config files in the project.
 */

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG, loadEnvironment } from '../../core/config.js';
import { AdevError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import type { CliCommand, CliOptions } from '../types.js';

// ── 디렉토리 구조 / Directory Structure ────────────────────────

/** .adev/ 하위에 생성할 디렉토리 목록 / Subdirectories to create under .adev/ */
const ADEV_SUBDIRS = ['data', 'agents', 'sessions'] as const;

// ── InitCommand ────────────────────────────────────────────────

/**
 * 프로젝트 초기화 명령 / Project initialization command
 *
 * @description
 * KR: .adev/ 디렉토리 구조를 생성하고 기본 config.json을 작성한다.
 * EN: Creates .adev/ directory structure and writes default config.json.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const cmd = new InitCommand(logger);
 * const result = await cmd.execute([], { flags: {} });
 */
export class InitCommand implements CliCommand {
  readonly name = 'init';
  readonly description = 'Initialize adev project / adev 프로젝트 초기화';
  readonly aliases = ['i'] as const;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:init' });
  }

  /**
   * init 명령 실행 / Execute init command
   *
   * @param args - 위치 인자 (미사용) / Positional args (unused)
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(_args: readonly string[], options: CliOptions): Promise<Result<void, AdevError>> {
    const projectPath = resolve(options.projectPath ?? '.');
    const adevDir = resolve(projectPath, '.adev');

    this.logger.info('프로젝트 초기화 시작 / Initializing project', { projectPath });

    // WHY: 기존 .adev 디렉토리가 있으면 중복 초기화를 방지한다
    const configFilePath = resolve(adevDir, 'config.json');
    const configFile = Bun.file(configFilePath);
    if (await configFile.exists()) {
      return err(
        new AdevError(
          'cli_init_already_exists',
          `.adev/config.json이 이미 존재합니다: ${configFilePath}`,
        ),
      );
    }

    // 디렉토리 생성 / Create directories
    try {
      await mkdir(adevDir, { recursive: true });

      for (const subdir of ADEV_SUBDIRS) {
        await mkdir(resolve(adevDir, subdir), { recursive: true });
      }
    } catch (error: unknown) {
      return err(
        new AdevError('cli_init_mkdir_failed', `디렉토리 생성 실패: ${String(error)}`, error),
      );
    }

    // 기본 config.json 작성 / Write default config.json
    try {
      await Bun.write(configFilePath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    } catch (error: unknown) {
      return err(
        new AdevError('cli_init_write_failed', `config.json 작성 실패: ${String(error)}`, error),
      );
    }

    // 인증 환경 검증 / Validate auth environment
    const envResult = loadEnvironment();
    if (!envResult.ok) {
      this.logger.warn('인증 환경 미설정 / Auth environment not configured', {
        error: envResult.error.message,
      });
    }

    this.logger.info('프로젝트 초기화 완료 / Project initialized', {
      projectPath,
      adevDir,
    });
    return ok(undefined);
  }
}
