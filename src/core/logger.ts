/**
 * adev 구조화된 로깅 / Structured logging with credential masking
 *
 * @description
 * console.log 대체. JSON 구조화 로깅. credential 자동 마스킹.
 * 모든 모듈은 이 Logger 인터페이스를 통해 로깅한다.
 */

// ── 타입 정의 ────────────────────────────────────────────────

/** 로그 레벨 (debug < info < warn < error) */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 구조화된 로그 엔트리 */
export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly context?: Record<string, unknown>;
}

/** 로거 인터페이스 — 모든 모듈의 로깅 추상화 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;

  /** 모듈별 컨텍스트를 상속하는 하위 Logger 생성 */
  child(context: Record<string, unknown>): Logger;
}

// ── Credential 마스킹 ────────────────────────────────────────

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /sk-ant-oat\d{2}-[a-zA-Z0-9_-]+/g,
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /ANTHROPIC_API_KEY=\S+/g,
  /CLAUDE_CODE_OAUTH_TOKEN=\S+/g,
];

/**
 * 민감한 정보를 마스킹한다 / Mask sensitive credentials in text
 *
 * @param text - 마스킹할 문자열
 * @returns 민감 정보가 '***REDACTED***'로 치환된 문자열
 *
 * @example
 * maskSensitiveData('key: sk-ant-api01-abc123...') // 'key: ***REDACTED***'
 */
export function maskSensitiveData(text: string): string {
  let masked = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(new RegExp(pattern.source, pattern.flags), '***REDACTED***');
  }
  return masked;
}

/**
 * 객체 내 문자열 값을 재귀적으로 마스킹한다 / Recursively mask sensitive data in objects
 */
function maskContext(context: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      masked[key] = maskSensitiveData(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      masked[key] = maskContext(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

// ── 레벨 우선순위 ────────────────────────────────────────────

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ── ConsoleLogger 구현 ──────────────────────────────────────

/**
 * 콘솔 기반 구조화 로거 / Console-based structured logger
 *
 * @param level - 최소 출력 로그 레벨
 * @param baseContext - 모든 로그에 자동 포함되는 기본 컨텍스트
 *
 * @example
 * const logger = new ConsoleLogger('info');
 * const moduleLogger = logger.child({ module: 'config' });
 * moduleLogger.info('설정 로드 완료');
 */
export class ConsoleLogger implements Logger {
  private readonly minPriority: number;

  constructor(
    private readonly level: LogLevel,
    private readonly baseContext: Record<string, unknown> = {},
  ) {
    this.minPriority = LOG_LEVEL_PRIORITY[level];
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.baseContext, ...context });
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < this.minPriority) return;

    const mergedContext = context ? { ...this.baseContext, ...context } : this.baseContext;

    const entry: LogEntry = {
      level,
      message: maskSensitiveData(message),
      timestamp: new Date().toISOString(),
      ...(Object.keys(mergedContext).length > 0 ? { context: maskContext(mergedContext) } : {}),
    };

    const output = JSON.stringify(entry);

    // WHY: stderr 사용 — stdout은 CLI 출력 전용, 로그는 stderr로 분리
    switch (level) {
      case 'error':
        process.stderr.write(`${output}\n`);
        break;
      case 'warn':
        process.stderr.write(`${output}\n`);
        break;
      default:
        process.stderr.write(`${output}\n`);
        break;
    }
  }
}
