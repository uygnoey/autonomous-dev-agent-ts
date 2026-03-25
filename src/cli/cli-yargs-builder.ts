/**
 * yargs 명령어 파서 빌더 / yargs command parser builder
 *
 * @description
 * KR: yargs 인스턴스를 구성하고 모든 CLI 명령어를 등록한다.
 *     CliApp.run()에서 분리하여 파싱 로직을 단독으로 테스트 가능하게 한다.
 * EN: Configures the yargs instance and registers all CLI commands.
 *     Separated from CliApp.run() to allow isolated testing of parsing logic.
 */

import yargs from 'yargs';

/**
 * CLI 버전 문자열 / CLI version string
 */
export type CliVersion = string;

/**
 * yargs 파서를 생성하고 모든 명령어를 등록한다 / Build yargs parser with all commands registered
 *
 * @param args - hideBin 처리된 인자 / Arguments processed with hideBin
 * @param cliVersion - CLI 버전 / CLI version
 * @returns 파싱된 args 객체 / Parsed args object
 */
export async function buildYargsParser(
  args: string[],
  cliVersion: CliVersion,
): Promise<Record<string, unknown> & { _: (string | number)[]; $0: string }> {
  // WHY: dot-notation 비활성화 — `log.level` 같은 키를 nested object로 파싱하지 않고 문자열 그대로 전달
  return yargs(args)
    .parserConfiguration({ 'dot-notation': false })
    .command('init [path]', 'Initialize project', (y) =>
      y.positional('path', { type: 'string', describe: 'Project path' }).option('yes', {
        alias: 'y',
        type: 'boolean',
        description: '대화형 모드 스킵, 기본값 사용 / Skip interactive mode, use defaults',
      }),
    )
    .command('start [feature]', 'Start Layer1 conversation', (y) =>
      y.positional('feature', { type: 'string', describe: 'Feature description' }),
    )
    .command('auth', 'Setup or renew authentication', (y) =>
      y
        .option('status', { type: 'boolean', describe: 'Show current auth status' })
        .option('clear', { type: 'boolean', describe: 'Clear saved credentials' }),
    )
    .command('setup-token', 'Renew Claude OAuth token (shortcut for auth --renew)')
    .command('status', 'Show current development status', (y) =>
      y.option('project-path', {
        type: 'string',
        describe: 'Project path / 프로젝트 경로',
      }),
    )
    .command('config <sub> [args..]', 'Manage configuration', (y) =>
      y
        .positional('sub', { type: 'string', describe: 'Subcommand (get/set/list/reset)' })
        .positional('args', {
          type: 'string',
          array: true,
          describe: 'Subcommand arguments (e.g. key, value)',
        }),
    )
    .command('setting <sub> [args..]', 'Manage configuration (alias: config)', (y) =>
      y
        .positional('sub', { type: 'string', describe: 'Subcommand (get/set/list/reset)' })
        .positional('args', {
          type: 'string',
          array: true,
          describe: 'Subcommand arguments (e.g. key, value)',
        }),
    )
    .command('project <sub> [args..]', 'Manage projects', (y) =>
      y
        .positional('sub', {
          type: 'string',
          describe: 'Subcommand (add/remove/list/switch/update)',
        })
        .positional('args', {
          type: 'string',
          array: true,
          describe: 'Subcommand arguments (e.g. path for add)',
        }),
    )
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Enable verbose logging',
    })
    .option('help', {
      alias: 'h',
      type: 'boolean',
      description: 'Show help',
    })
    .version(cliVersion)
    .alias('V', 'version')
    .option('no-color', {
      type: 'boolean',
      description: 'Disable colors',
    })
    .strict()
    .fail(false)
    .parse();
}
