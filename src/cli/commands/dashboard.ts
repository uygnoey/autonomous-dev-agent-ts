/**
 * adev dashboard 명령어 / adev dashboard command
 *
 * @description
 * KR: 실시간 모니터링 대시보드 서버를 시작한다.
 *     Bun HTTP + WebSocket 서버로 브라우저에서 에이전트 상태를 실시간 조회할 수 있다.
 * EN: Starts the real-time monitoring dashboard server.
 *     Bun HTTP + WebSocket server for viewing agent status in a browser.
 *
 * @example
 * adev dashboard                  # 기본 포트 3100
 * adev dashboard --port=8080      # 포트 지정
 */

import type { CliOptions } from 'cli/types.js';
import type { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { NoOpMetricsCollector } from 'core/metrics.js';
import { ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { MetricsBridge } from 'dashboard/metrics-bridge.js';
import { DashboardServer } from 'dashboard/server.js';
import { DEFAULT_DASHBOARD_CONFIG } from 'dashboard/types.js';
import type { DashboardConfig } from 'dashboard/types.js';

/**
 * 대시보드 명령 / Dashboard command
 *
 * @description
 * KR: 실시간 모니터링 대시보드를 시작하고, SIGINT/SIGTERM으로 종료될 때까지 대기한다.
 * EN: Starts the real-time monitoring dashboard and waits until SIGINT/SIGTERM.
 */
class DashboardCommand {
  readonly name = 'dashboard';
  readonly description = 'Start real-time monitoring dashboard / 실시간 모니터링 대시보드 시작';
  readonly aliases = ['dash'] as const;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:dashboard' });
  }

  /**
   * dashboard 명령 실행 / Execute dashboard command
   *
   * @param _args - 미사용 인자 / Unused arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 서버 종료 시 ok 반환 / Returns ok when server stops
   */
  async execute(
    _args: readonly string[],
    options: CliOptions | Record<string, unknown>,
  ): Promise<Result<{ success: boolean; exitCode: number }, AdevError>> {
    const config = this.parseConfig(options);

    // WHY: 독립 실행 모드에서는 NoOp 수집기를 delegate로 사용
    const bridge = new MetricsBridge(new NoOpMetricsCollector(), this.logger);
    const server = new DashboardServer(config, bridge, this.logger);

    const url = server.start();

    process.stdout.write(`\nadev Dashboard running at ${url}\n`);
    process.stdout.write('Press Ctrl+C to stop.\n\n');

    // WHY: 서버가 종료 신호를 받을 때까지 대기
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        server.stop();
        resolve();
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });

    return ok({ success: true, exitCode: 0 });
  }

  /**
   * 도움말 텍스트 반환 / Return help text
   */
  help(): string {
    return [
      'adev dashboard - 실시간 모니터링 대시보드 시작',
      '',
      'Options:',
      '  --port=<number>  서버 포트 (기본: 3100)',
      '  --host=<string>  바인딩 주소 (기본: 127.0.0.1)',
    ].join('\n');
  }

  /**
   * CLI 옵션에서 대시보드 설정을 파싱한다 / Parse dashboard config from CLI options
   */
  private parseConfig(options: CliOptions | Record<string, unknown>): DashboardConfig {
    const portRaw = options.port;
    const hostRaw = options.host;

    const port =
      typeof portRaw === 'string'
        ? Number.parseInt(portRaw, 10)
        : typeof portRaw === 'number'
          ? portRaw
          : DEFAULT_DASHBOARD_CONFIG.port;

    const host = typeof hostRaw === 'string' ? hostRaw : DEFAULT_DASHBOARD_CONFIG.host;

    return { port: Number.isNaN(port) ? DEFAULT_DASHBOARD_CONFIG.port : port, host };
  }
}
