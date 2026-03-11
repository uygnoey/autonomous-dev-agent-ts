/**
 * IPC 폴러 타입 정의 / IPC poller type definitions
 *
 * @description
 * KR: 디스크 기반 IPC 폴링에 사용되는 이벤트 타입, 옵션, 콜백 인터페이스를 정의한다.
 * EN: Defines event types, options, and callback interface for disk-based IPC polling.
 */

// ── 이벤트 타입 ──────────────────────────────────────────────

/** IPC 이벤트 종류 / IPC event kinds */
export type IpcEventType = 'team_message' | 'task_update';

/**
 * team_message 이벤트 — 팀 메시지 파일 신규 감지 시 발생
 * Emitted when a new file is detected under the team messages directory.
 */
export interface TeamMessageEvent {
  readonly type: 'team_message';
  /** 감지된 팀 ID / Team ID derived from directory name */
  readonly teamId: string;
  /** 파일 내용을 파싱한 payload / Parsed file contents */
  readonly payload: Record<string, unknown>;
  /** 감지된 파일 절대 경로 / Absolute path of the detected file */
  readonly filePath: string;
  /** 이벤트 감지 시각 / Timestamp when the event was detected */
  readonly detectedAt: Date;
}

/**
 * task_update 이벤트 — task JSON 파일 신규 생성 또는 mtime 변경 시 발생
 * Emitted when a task JSON file is created or its mtime changes.
 */
export interface TaskUpdateEvent {
  readonly type: 'task_update';
  /** 파일명에서 추출한 태스크 ID / Task ID extracted from file name */
  readonly taskId: string;
  /** 파일 내용을 파싱한 payload / Parsed file contents */
  readonly payload: Record<string, unknown>;
  /** 감지된 파일 절대 경로 / Absolute path of the detected file */
  readonly filePath: string;
  /** 이벤트 감지 시각 / Timestamp when the event was detected */
  readonly detectedAt: Date;
}

/** IPC 이벤트 유니온 / Union of all IPC events */
export type IpcEvent = TeamMessageEvent | TaskUpdateEvent;

// ── 콜백 ────────────────────────────────────────────────────

/**
 * IPC 이벤트 콜백 / Callback invoked for each IPC event
 *
 * @param event - 발생한 IPC 이벤트 / The IPC event that was detected
 */
export type IpcPollerCallback = (event: IpcEvent) => void | Promise<void>;

// ── 옵션 ────────────────────────────────────────────────────

/**
 * IpcPoller 생성자 옵션 / Constructor options for IpcPoller
 *
 * @param teamsDir - 팀 메시지 디렉토리 루트 (예: ~/.claude/teams) / Root directory for team messages
 * @param tasksDir - 태스크 JSON 파일 디렉토리 (예: ~/.claude/tasks) / Directory for task JSON files
 * @param intervalMs - 폴링 간격 (기본 500ms) / Polling interval in ms (default 500)
 * @param logger - 로거 인스턴스 / Logger instance
 */
export interface IpcPollerOptions {
  readonly teamsDir: string;
  readonly tasksDir: string;
  readonly intervalMs?: number;
  readonly logger: import('core/logger.js').Logger;
}
