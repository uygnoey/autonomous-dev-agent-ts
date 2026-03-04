/**
 * 프로세스 실행기 / Process Executor
 *
 * @description
 * KR: Bun.spawn을 사용하여 외부 프로세스를 실행하고 결과를 캡처한다.
 *     stdout/stderr 스트리밍, 타임아웃, 에러 처리를 제공한다.
 * EN: Executes external processes using Bun.spawn with stdout/stderr streaming,
 *     timeout handling, and error management.
 */

import type { Subprocess } from 'bun';
import { AdevError } from './errors.js';
import type { Logger } from './logger.js';
import { err, ok } from './types.js';
import type { Result } from './types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 타임아웃 (밀리초) / Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

/** 최대 출력 버퍼 크기 (바이트) / Maximum output buffer size in bytes */
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB

// ── 타입 / Types ────────────────────────────────────────────────

/**
 * 프로세스 실행 옵션 / Process execution options
 *
 * @description
 * KR: 프로세스 실행 시 사용할 설정.
 * EN: Configuration for process execution.
 */
export interface ProcessOptions {
  /** 작업 디렉토리 / Working directory */
  readonly cwd?: string;
  /** 환경변수 / Environment variables */
  readonly env?: Readonly<Record<string, string>>;
  /** 타임아웃 (밀리초) / Timeout in milliseconds */
  readonly timeoutMs?: number;
  /** stdin 입력 / stdin input */
  readonly stdin?: string;
}

/**
 * 프로세스 실행 결과 / Process execution result
 *
 * @description
 * KR: 프로세스 실행 완료 후 반환되는 결과.
 * EN: Result returned after process execution completes.
 */
export interface ProcessResult {
  /** 종료 코드 / Exit code */
  readonly exitCode: number;
  /** 표준 출력 / Standard output */
  readonly stdout: string;
  /** 표준 에러 / Standard error */
  readonly stderr: string;
  /** 실행 시간 (밀리초) / Execution time in milliseconds */
  readonly durationMs: number;
}

// ── ProcessExecutor ─────────────────────────────────────────────

/**
 * 프로세스 실행기 / Process Executor
 *
 * @description
 * KR: 외부 명령을 실행하고 결과를 캡처한다.
 * EN: Executes external commands and captures results.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const executor = new ProcessExecutor(logger);
 * const result = await executor.execute('ls', ['-la'], { cwd: '/tmp' });
 * if (result.ok) console.log(result.value.stdout);
 */
export class ProcessExecutor {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'process-executor' });
  }

  /**
   * 프로세스를 실행한다 / Execute a process
   *
   * @param command - 실행할 명령 / Command to execute
   * @param args - 명령 인자 / Command arguments
   * @param options - 실행 옵션 / Execution options
   * @returns 프로세스 실행 결과 / Process execution result
   *
   * @example
   * const result = await executor.execute('git', ['status'], { cwd: '/project' });
   * if (result.ok) {
   *   console.log('Exit code:', result.value.exitCode);
   *   console.log('Output:', result.value.stdout);
   * }
   */
  async execute(
    command: string,
    args: readonly string[] = [],
    options: ProcessOptions = {},
  ): Promise<Result<ProcessResult>> {
    const { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, stdin } = options;

    this.logger.debug('프로세스 실행 시작', {
      command,
      args: args.slice(0, 5), // WHY: 긴 인자 목록 방지
      cwd,
      timeoutMs,
    });

    const startTime = performance.now();

    try {
      // WHY: Bun.spawn으로 서브프로세스 생성
      const proc = Bun.spawn([command, ...args], {
        cwd,
        env: { ...process.env, ...env },
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: stdin ? 'pipe' : undefined,
      });

      // WHY: stdin 입력이 있으면 작성 후 닫기
      if (stdin && proc.stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      // WHY: 타임아웃과 프로세스 완료를 경쟁시킴
      const resultOrTimeout = await Promise.race([
        this.collectOutput(proc),
        this.timeout(timeoutMs),
      ]);

      if (resultOrTimeout === 'timeout') {
        proc.kill();
        return err(
          new AdevError('process_timeout', `프로세스 타임아웃: ${command} (${timeoutMs}ms 초과)`),
        );
      }

      const { stdout, stderr, exitCode } = resultOrTimeout;
      const durationMs = Math.round(performance.now() - startTime);

      this.logger.debug('프로세스 실행 완료', {
        command,
        exitCode,
        durationMs,
        stdoutSize: stdout.length,
        stderrSize: stderr.length,
      });

      return ok({ exitCode, stdout, stderr, durationMs });
    } catch (error: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      this.logger.error('프로세스 실행 실패', {
        command,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      });

      // WHY: AdevError는 그대로 전달 (에러 코드 보존)
      if (error instanceof AdevError) {
        return err(error);
      }

      // WHY: 다른 에러만 래핑
      return err(
        new AdevError('process_execution_error', `프로세스 실행 실패: ${String(error)}`, error),
      );
    }
  }

  /**
   * 프로세스 출력을 수집한다 / Collect process output
   *
   * @description
   * KR: stdout/stderr를 비동기로 읽어 문자열로 변환한다.
   *     최대 출력 크기를 초과하면 에러를 던진다.
   * EN: Asynchronously reads stdout/stderr and converts to strings.
   *     Throws error if maximum output size is exceeded.
   */
  private async collectOutput(
    proc: Subprocess<'pipe', 'pipe', 'pipe'>,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // WHY: stdout/stderr를 병렬로 읽기
    const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
      this.readStream(proc.stdout),
      this.readStream(proc.stderr),
      proc.exited,
    ]);

    const stdout = new TextDecoder().decode(stdoutBuf);
    const stderr = new TextDecoder().decode(stderrBuf);

    return { stdout, stderr, exitCode };
  }

  /**
   * 스트림을 버퍼로 읽는다 / Read stream into buffer
   *
   * @description
   * KR: 스트림을 Uint8Array로 읽되, 최대 크기를 초과하면 에러를 던진다.
   * EN: Reads stream into Uint8Array, throwing error if max size exceeded.
   */
  private async readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > MAX_OUTPUT_SIZE) {
          throw new AdevError(
            'process_output_too_large',
            `프로세스 출력 크기 초과: ${totalSize} > ${MAX_OUTPUT_SIZE} bytes`,
          );
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // WHY: 모든 청크를 하나의 Uint8Array로 합치기
    if (chunks.length === 1 && chunks[0]) {
      return chunks[0];
    }

    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined;
  }

  /**
   * 타임아웃 Promise / Timeout promise
   *
   * @description
   * KR: 지정된 시간 후 'timeout' 문자열을 반환하는 Promise.
   * EN: Promise that resolves to 'timeout' string after specified duration.
   */
  private timeout(ms: number): Promise<'timeout'> {
    return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
  }
}
