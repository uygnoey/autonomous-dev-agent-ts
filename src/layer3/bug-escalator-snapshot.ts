/**
 * 산출물 스냅샷 관리 / Artifact snapshot management
 *
 * @description
 * KR: 2계층 재실행 전 산출물 백업 및 복원 기능을 제공한다.
 * EN: Provides artifact backup and restore before Layer 2 re-execution.
 */

import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';

/**
 * 산출물 스냅샷 / Artifact snapshot
 *
 * @description
 * KR: 2계층 재실행 전 산출물 경로 목록을 저장한다.
 *     재실행 실패 시 이전 산출물로 복원할 수 있도록 참조 정보를 보관한다.
 * EN: Stores artifact path list before Layer 2 re-execution.
 *     Keeps reference info for restoring previous artifacts if re-run fails.
 */
export interface ArtifactSnapshot {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 산출물 파일 경로 목록 / Artifact file paths */
  readonly artifactPaths: readonly string[];
  /** 스냅샷 저장 시각 / Snapshot saved at */
  readonly savedAt: Date;
  /** 백업 디렉토리 경로 (파일 복사본 저장 위치) / Backup directory path */
  readonly backupDir?: string;
}

/**
 * 산출물 스냅샷 저장소 / Artifact snapshot store
 *
 * @description
 * KR: 프로젝트별 산출물 스냅샷 저장·조회·삭제·복원을 관리한다.
 * EN: Manages per-project artifact snapshot save/get/clear/restore.
 */
export class ArtifactSnapshotStore {
  private readonly snapshots: Map<string, ArtifactSnapshot> = new Map();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 산출물 스냅샷을 저장한다 / Saves an artifact snapshot
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param featureId - 기능 ID / Feature ID
   * @param artifactPaths - 산출물 파일 경로 목록 / Artifact file paths
   */
  async save(
    projectId: string,
    featureId: string,
    artifactPaths: readonly string[],
  ): Promise<void> {
    const backupDir = join('/tmp', 'adev-artifact-backup', projectId, `${Date.now()}`);
    await mkdir(backupDir, { recursive: true });

    // WHY: 파일이 실제 존재하는 경우에만 백업 — 존재하지 않는 경로는 무시
    for (const artifactPath of artifactPaths) {
      const file = Bun.file(artifactPath);
      if (await file.exists()) {
        const destPath = join(backupDir, basename(artifactPath));
        await Bun.write(destPath, file);
      }
    }

    const snapshot: ArtifactSnapshot = {
      projectId,
      featureId,
      artifactPaths: [...artifactPaths],
      savedAt: new Date(),
      backupDir,
    };
    this.snapshots.set(projectId, snapshot);
    this.logger.info('산출물 스냅샷 저장 (백업 포함)', {
      projectId,
      featureId,
      pathCount: artifactPaths.length,
      backupDir,
    });
  }

  /**
   * 산출물 스냅샷을 조회한다 / Gets an artifact snapshot
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 스냅샷 또는 null / Snapshot or null
   */
  get(projectId: string): ArtifactSnapshot | null {
    return this.snapshots.get(projectId) ?? null;
  }

  /**
   * 산출물 스냅샷을 삭제한다 / Clears an artifact snapshot
   *
   * @param projectId - 프로젝트 ID / Project ID
   */
  clear(projectId: string): void {
    this.snapshots.delete(projectId);
    this.logger.debug('산출물 스냅샷 삭제', { projectId });
  }

  /**
   * 백업된 산출물을 원래 경로로 복원한다 / Restore backed-up artifacts to original paths
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns ok(void) 복원 성공, err(AdevError) 실패 시 / ok on success, err on failure
   */
  async restore(projectId: string): Promise<Result<void>> {
    const snapshot = this.get(projectId);
    if (!snapshot) {
      return err(
        new AgentError('agent_invalid_input', `산출물 스냅샷을 찾을 수 없습니다: ${projectId}`),
      );
    }

    if (!snapshot.backupDir) {
      this.clear(projectId);
      return ok(undefined);
    }

    try {
      // WHY: 백업 파일명과 원래 경로를 basename으로 매칭하여 복원
      for (const artifactPath of snapshot.artifactPaths) {
        const backupFilePath = join(snapshot.backupDir, basename(artifactPath));
        const backupFile = Bun.file(backupFilePath);
        if (await backupFile.exists()) {
          await Bun.write(artifactPath, backupFile);
          this.logger.debug('산출물 복원', { from: backupFilePath, to: artifactPath });
        }
      }

      this.logger.info('산출물 스냅샷 복원 완료', {
        projectId,
        pathCount: snapshot.artifactPaths.length,
        backupDir: snapshot.backupDir,
      });

      this.clear(projectId);
      return ok(undefined);
    } catch (cause) {
      return err(new AgentError('agent_invalid_input', `산출물 복원 실패: ${projectId}`, cause));
    }
  }
}
