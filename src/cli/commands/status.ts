/**
 * adev status 명령어 / adev status command
 *
 * @description
 * KR: 현재 진행 중인 프로젝트의 개발 상태를 조회한다.
 *     .adev/sessions/ 디렉토리와 progress.json 파일을 읽어 출력한다.
 * EN: Shows the current development status of the active project.
 *     Reads .adev/sessions/ directory and progress.json file.
 *
 * @example
 * adev status                    # 현재 디렉토리 프로젝트 상태
 * adev status --project-path /p  # 특정 프로젝트 상태
 */

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CliOptions } from 'cli/types.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Phase } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── 진행 상태 파일 타입 / Progress file types ──────────────────

/**
 * progress.json 내 기능 항목 / Feature entry in progress.json
 */
interface ProgressEntry {
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 기능 상태 / Feature status */
  readonly status: string;
  /** 현재 Phase / Current phase */
  readonly currentPhase: Phase;
  /** 갱신 시각 / Updated at */
  readonly updatedAt: string;
}

/**
 * progress.json 전체 구조 / Full progress.json structure
 */
interface ProgressFile {
  /** 기능 목록 / Feature list */
  readonly features: readonly ProgressEntry[];
}

// ── StatusCommand ──────────────────────────────────────────────

/**
 * 개발 상태 조회 명령 / Development status query command
 *
 * @description
 * KR: .adev/sessions/ 디렉토리와 .adev/progress.json을 읽어
 *     현재 프로젝트의 개발 진행 상태를 출력한다.
 * EN: Reads .adev/sessions/ directory and .adev/progress.json
 *     to display the current project's development status.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const cmd = new StatusCommand(logger);
 * await cmd.execute([], { projectPath: '.' });
 */
export class StatusCommand {
  readonly name = 'status';
  readonly description = 'Show current development status / 현재 개발 상태 조회';
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:status' });
  }

  /**
   * status 명령 실행 / Execute status command
   *
   * @param _args - 미사용 인자 / Unused arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok({ success: true, exitCode: 0 })
   */
  async execute(
    _args: readonly string[],
    options: CliOptions | Record<string, unknown>,
  ): Promise<Result<{ success: boolean; exitCode: number }, AdevError>> {
    const projectPath = resolve(
      typeof options.projectPath === 'string' ? options.projectPath : '.',
    );
    const adevDir = join(projectPath, '.adev');

    this.logger.debug('status 명령 실행', { projectPath });

    // WHY: 출력은 stdout에 직접 write (CLI 표시용)
    process.stdout.write('\n=== adev 개발 상태 ===\n');
    process.stdout.write(`프로젝트: ${projectPath}\n`);

    // ── 세션 목록 읽기 / Read session list ──
    const sessionCount = await this.countSessions(join(adevDir, 'sessions'));
    process.stdout.write(`활성 세션: ${sessionCount}개\n`);

    // ── 진행 상태 읽기 / Read progress ──
    const progressResult = await this.readProgress(join(adevDir, 'progress.json'));

    if (!progressResult.ok) {
      // WHY: progress.json 없으면 에러가 아닌 안내 메시지 출력
      process.stdout.write('\n진행 중인 개발이 없습니다.\n\n');
      return ok({ success: true, exitCode: 0 });
    }

    const features = progressResult.value;

    if (features.length === 0) {
      process.stdout.write('\n진행 중인 개발이 없습니다.\n\n');
      return ok({ success: true, exitCode: 0 });
    }

    process.stdout.write('\n기능별 진행 현황:\n');
    for (const feature of features) {
      process.stdout.write(
        `  ${feature.featureId}: ${feature.status} (Phase: ${feature.currentPhase})\n`,
      );
    }
    process.stdout.write('\n');

    return ok({ success: true, exitCode: 0 });
  }

  /**
   * 도움말 텍스트 반환 / Return help text
   *
   * @returns 도움말 문자열 / Help string
   */
  help(): string {
    return 'adev status - Show current development status / 현재 개발 상태 조회';
  }

  /**
   * 세션 디렉토리 내 파일 수를 반환한다 / Count files in sessions directory
   *
   * @param sessionsDir - 세션 디렉토리 경로 / Sessions directory path
   * @returns 세션 파일 수 / Number of session files
   */
  private async countSessions(sessionsDir: string): Promise<number> {
    try {
      const entries = await readdir(sessionsDir);
      return entries.length;
    } catch {
      // WHY: 디렉토리 없으면 0 반환 (graceful)
      return 0;
    }
  }

  /**
   * progress.json을 읽어 기능 목록을 반환한다 / Read progress.json and return feature list
   *
   * @param progressPath - progress.json 경로 / Path to progress.json
   * @returns 기능 목록 또는 에러 / Feature list or error
   */
  private async readProgress(
    progressPath: string,
  ): Promise<Result<readonly ProgressEntry[], AdevError>> {
    try {
      const file = Bun.file(progressPath);
      const exists = await file.exists();

      if (!exists) {
        return err(new AdevError('cli_status_no_progress', 'progress.json 파일이 없습니다.'));
      }

      const text = await file.text();
      if (text.trim() === '') {
        return ok([]);
      }

      const parsed: unknown = JSON.parse(text);

      // WHY: 배열 형태와 객체 형태 모두 지원
      if (Array.isArray(parsed)) {
        return ok(parsed as ProgressEntry[]);
      }

      if (typeof parsed === 'object' && parsed !== null && 'features' in parsed) {
        const progressFile = parsed as ProgressFile;
        return ok(progressFile.features);
      }

      return ok([]);
    } catch {
      return err(new AdevError('cli_status_read_error', 'progress.json 읽기 실패'));
    }
  }
}
