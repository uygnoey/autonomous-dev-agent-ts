/**
 * 디스크 IPC 폴러 / Disk-based IPC poller
 *
 * @description
 * KR: ~/.claude/teams/{teamId}/inboxes/ 및 ~/.claude/tasks/*.json 을
 *     500ms 간격으로 폴링하여 새 파일 및 mtime 변경을 감지한다.
 * EN: Polls ~/.claude/teams/{teamId}/inboxes/ and ~/.claude/tasks/*.json
 *     every 500 ms to detect new files and mtime changes.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import type { Logger } from 'core/logger.js';
import type { IpcEvent, IpcPollerCallback, IpcPollerOptions } from 'layer2/ipc-poller-types.js';

// ── 상수 ────────────────────────────────────────────────────

/** 기본 폴링 간격 / Default polling interval (ms) */
const DEFAULT_INTERVAL_MS = 500;
/** seenFiles Map 최대 크기 / Maximum seenFiles Map size */
const SEEN_FILES_MAX = 10_000;
/** 최대치 초과 시 삭제할 오래된 항목 수 / Entries to evict when over limit */
const SEEN_FILES_EVICT = 1_000;

// ── IpcPoller ────────────────────────────────────────────────

/**
 * 디스크 기반 IPC 폴러 / Disk-based IPC poller
 *
 * @description
 * KR: 지정된 디렉토리를 주기적으로 스캔하여 새 파일이나 mtime 변경을
 *     IpcEvent 콜백으로 전달한다.
 * EN: Periodically scans specified directories and dispatches IpcEvents
 *     to the registered callback on new files or mtime changes.
 *
 * @example
 * const poller = new IpcPoller({ teamsDir, tasksDir, logger });
 * poller.start((event) => handleIpcEvent(event));
 * // later…
 * poller.stop();
 */
export class IpcPoller {
  private readonly teamsDir: string;
  private readonly tasksDir: string;
  private readonly intervalMs: number;
  private readonly logger: Logger;

  /** filePath → mtime (ms epoch) — 중복 처리 방지 */
  private readonly seenFiles: Map<string, number> = new Map();

  /** setInterval 핸들 — null 이면 미실행 */
  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor(options: IpcPollerOptions) {
    // WHY: resolve로 절대경로 정규화 — path traversal 방지
    this.teamsDir = resolve(options.teamsDir);
    this.tasksDir = resolve(options.tasksDir);
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.logger = options.logger.child({ module: 'IpcPoller' });
  }

  // ── 공개 API ──────────────────────────────────────────────

  /**
   * 폴링을 시작한다 / Start polling
   *
   * @param callback - IPC 이벤트를 수신할 콜백 / Callback to receive IPC events
   */
  start(callback: IpcPollerCallback): void {
    if (this.timerId !== null) {
      this.logger.warn('IpcPoller already running — start() ignored');
      return;
    }
    this.logger.info('IpcPoller started', {
      teamsDir: this.teamsDir,
      tasksDir: this.tasksDir,
      intervalMs: this.intervalMs,
    });
    // WHY: 최초 tick을 즉시 실행하여 시작 직후 이벤트를 빠르게 감지
    void this.poll(callback);
    this.timerId = setInterval(() => {
      void this.poll(callback);
    }, this.intervalMs);
  }

  /**
   * 폴링을 중단한다 / Stop polling
   */
  stop(): void {
    if (this.timerId === null) return;
    clearInterval(this.timerId);
    this.timerId = null;
    this.logger.info('IpcPoller stopped');
  }

  /**
   * 폴링이 실행 중인지 반환 / Whether polling is active
   */
  isRunning(): boolean {
    return this.timerId !== null;
  }

  // ── 내부 폴링 로직 ─────────────────────────────────────────

  /**
   * 한 번의 폴링 사이클 / Single poll cycle
   */
  private async poll(callback: IpcPollerCallback): Promise<void> {
    await Promise.all([this.pollTeams(callback), this.pollTasks(callback)]);
  }

  /**
   * 팀 inbox 디렉토리 감시 / Scan team inbox directories
   *
   * 구조: {teamsDir}/{teamId}/inboxes/{agent}.json (PoC §16 확인값)
   */
  private async pollTeams(callback: IpcPollerCallback): Promise<void> {
    let teamEntries: string[];
    try {
      teamEntries = await readdir(this.teamsDir);
    } catch (err: unknown) {
      // WHY: ENOENT는 디렉토리 미생성 상태 — 정상 케이스로 skip
      if (isEnoent(err)) return;
      this.logger.warn('IpcPoller: teamsDir readdir failed', { error: String(err) });
      return;
    }

    for (const teamId of teamEntries) {
      const teamDir = safeJoin(this.teamsDir, teamId);
      if (teamDir === null) {
        this.logger.warn('IpcPoller: path traversal blocked', { teamId });
        continue;
      }
      // WHY: PoC §16 확인 — 실제 디스크 구조는 inboxes/ (messages/ 아님)
      const messagesDir = join(teamDir, 'inboxes');

      let files: string[];
      try {
        files = await readdir(messagesDir);
      } catch (err: unknown) {
        if (isEnoent(err)) continue;
        this.logger.warn('IpcPoller: inboxes readdir failed', {
          teamId,
          error: String(err),
        });
        continue;
      }

      for (const file of files) {
        const filePath = join(messagesDir, file);

        // path traversal 방지
        if (!filePath.startsWith(this.teamsDir)) {
          this.logger.warn('IpcPoller: blocked path outside teamsDir', { filePath });
          continue;
        }

        let mtime: number;
        try {
          const s = await stat(filePath);
          mtime = s.mtimeMs;
        } catch {
          continue;
        }

        // 이미 처리한 파일이면 skip (team_message는 신규 파일만 emit)
        if (this.seenFiles.has(filePath)) continue;

        const payload = await readJsonFile(filePath, this.logger);
        this.markSeen(filePath, mtime);

        const event: IpcEvent = {
          type: 'team_message',
          teamId,
          payload,
          filePath,
          detectedAt: new Date(),
        };
        await invokeCallback(callback, event, this.logger);
      }
    }
  }

  /**
   * 태스크 JSON 파일 감시 / Scan task JSON files
   *
   * 구조: {tasksDir}/*.json
   */
  private async pollTasks(callback: IpcPollerCallback): Promise<void> {
    let files: string[];
    try {
      files = await readdir(this.tasksDir);
    } catch (err: unknown) {
      if (isEnoent(err)) return;
      this.logger.warn('IpcPoller: tasksDir readdir failed', { error: String(err) });
      return;
    }

    for (const file of files) {
      if (extname(file) !== '.json') continue;

      const filePath = join(this.tasksDir, file);

      // path traversal 방지
      if (!filePath.startsWith(this.tasksDir)) {
        this.logger.warn('IpcPoller: blocked path outside tasksDir', { filePath });
        continue;
      }

      let mtime: number;
      try {
        const s = await stat(filePath);
        mtime = s.mtimeMs;
      } catch {
        continue;
      }

      const prevMtime = this.seenFiles.get(filePath);
      // 신규 파일도 아니고 mtime도 변하지 않았으면 skip
      if (prevMtime !== undefined && prevMtime === mtime) continue;

      const payload = await readJsonFile(filePath, this.logger);
      this.markSeen(filePath, mtime);

      // taskId: 파일명에서 확장자 제거
      const taskId = basename(file, '.json');

      const event: IpcEvent = {
        type: 'task_update',
        taskId,
        payload,
        filePath,
        detectedAt: new Date(),
      };
      await invokeCallback(callback, event, this.logger);
    }
  }

  /** seenFiles에 filePath → mtime 기록. 9,000개 초과 시 FIFO로 1,000개 삭제. */
  private markSeen(filePath: string, mtime: number): void {
    if (this.seenFiles.size > SEEN_FILES_MAX - SEEN_FILES_EVICT) {
      // WHY: Map 삽입 순서 FIFO 삭제 — LRU 불필요
      let evicted = 0;
      for (const key of this.seenFiles.keys()) {
        this.seenFiles.delete(key);
        if (++evicted >= SEEN_FILES_EVICT) break;
      }
    }
    this.seenFiles.set(filePath, mtime);
  }
}

// ── 모듈 내부 순수 헬퍼 ──────────────────────────────────────

/** 에러가 ENOENT인지 판별 / Check if error is ENOENT */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}

/** path traversal 방지 join — base 외부로 탈출하면 null 반환 */
function safeJoin(base: string, segment: string): string | null {
  const joined = resolve(base, segment);
  if (!joined.startsWith(base)) return null;
  return joined;
}

/**
 * JSON 파일을 읽어 Record<string, unknown>으로 반환
 * 파싱 실패 시 빈 객체 반환 (에러는 warn 로그)
 */
async function readJsonFile(filePath: string, logger: Logger): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch (err: unknown) {
    logger.warn('IpcPoller: JSON read/parse failed', { filePath, error: String(err) });
    return {};
  }
}

/** 콜백을 안전하게 호출 — throw는 logger.error로 흡수 */
async function invokeCallback(
  callback: IpcPollerCallback,
  event: IpcEvent,
  logger: Logger,
): Promise<void> {
  try {
    await callback(event);
  } catch (err: unknown) {
    logger.error('IpcPoller: callback threw an error', { type: event.type, error: String(err) });
  }
}
