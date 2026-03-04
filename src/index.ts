/**
 * adev CLI 엔트리포인트 / adev CLI entry point
 *
 * @description
 * KR: process.argv를 파싱하고 CommandRouter로 명령을 실행한다.
 *     process.exit()은 이 파일에서만 사용한다.
 * EN: Parses process.argv and executes commands via CommandRouter.
 *     process.exit() is ONLY allowed in this file.
 */

import {
  CommandRouter,
  ConfigCommand,
  InitCommand,
  ProjectCommand,
  StartCommand,
} from './cli/index.js';
import { ConsoleLogger } from './core/logger.js';

// ── 메인 실행 / Main execution ─────────────────────────────────

async function main(): Promise<void> {
  const logger = new ConsoleLogger('info');

  const router = new CommandRouter(logger);
  router.register(new InitCommand(logger));
  router.register(new StartCommand(logger));
  router.register(new ConfigCommand(logger));
  router.register(new ProjectCommand(logger));

  // WHY: process.argv[0] = bun, process.argv[1] = script path → [2:]가 실제 인자
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stderr.write(`${router.getHelp()}\n`);
    process.exit(0);
  }

  const result = await router.execute(args);

  if (!result.ok) {
    logger.error('명령 실행 실패 / Command execution failed', {
      code: result.error.code,
      message: result.error.message,
    });
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`예기치 않은 에러 / Unexpected error: ${String(error)}\n`);
  process.exit(1);
});
