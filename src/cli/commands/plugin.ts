/**
 * plugin 명령 / Plugin command
 *
 * @description
 * KR: 플러그인 관리 진입점. list, install, remove, create 서브커맨드를 제공한다.
 * EN: Plugin management entry point. Provides list, install, remove, create subcommands.
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { getDefaultGlobalAdevDir } from 'cli/commands/project-registry.js';
import type { CliOptions } from 'cli/types.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { PluginManifest } from 'core/plugin-loader.js';
import { DefaultPluginLoader } from 'core/plugin-loader.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

const GLOBAL_PLUGINS_DIR = 'plugins';
const PROJECT_PLUGINS_DIR = '.adev/plugins';

// ── PluginCommand ───────────────────────────────────────────────

/**
 * 플러그인 관리 명령 / Plugin management command
 *
 * @description
 * KR: 플러그인의 목록 조회, 설치, 제거, 보일러플레이트 생성을 수행하는 CLI 명령.
 * EN: CLI command for listing, installing, removing, and scaffolding plugins.
 *
 * @example
 * const cmd = new PluginCommand(logger);
 * await cmd.execute(['list'], {});
 * await cmd.execute(['install', 'my-plugin'], {});
 * await cmd.execute(['remove', 'my-plugin'], {});
 * await cmd.execute(['create', 'my-new-plugin'], {});
 */
export class PluginCommand {
  readonly name = 'plugin';
  readonly description = 'Plugin management / 플러그인 관리 (list/install/remove/create)';
  readonly aliases = ['plug'] as const;
  private readonly logger: Logger;
  private readonly globalPluginsDir: string;

  constructor(logger: Logger, globalAdevDir?: string) {
    this.logger = logger.child({ module: 'cli:plugin' });
    const adevDir = globalAdevDir ?? getDefaultGlobalAdevDir();
    this.globalPluginsDir = join(adevDir, GLOBAL_PLUGINS_DIR);
  }

  /**
   * plugin 명령 실행 / Execute plugin command
   *
   * @param args - 서브커맨드 + 인자 / Subcommand + arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(args: readonly string[], options: CliOptions): Promise<Result<void, AdevError>> {
    const subcommand = args[0];

    if (!subcommand) {
      return err(
        new AdevError(
          'cli_plugin_missing_subcommand',
          '서브커맨드가 필요합니다: list, install, remove, create',
        ),
      );
    }

    const projectDir = this.resolveProjectPluginsDir(options);

    switch (subcommand) {
      case 'list':
        return this.handleList(projectDir);
      case 'install':
        return this.handleInstall(args.slice(1), projectDir);
      case 'remove':
        return this.handleRemove(args.slice(1));
      case 'create':
        return this.handleCreate(args.slice(1));
      default:
        return err(
          new AdevError(
            'cli_plugin_unknown_subcommand',
            `알 수 없는 서브커맨드: '${subcommand}'. 사용 가능: list, install, remove, create`,
          ),
        );
    }
  }

  // ── list ─────────────────────────────────────────────────────

  /**
   * 설치된 플러그인 목록을 출력한다 / List installed plugins
   */
  private async handleList(projectDir?: string): Promise<Result<void, AdevError>> {
    const loader = new DefaultPluginLoader(this.logger);
    const loadResult = await loader.loadPlugins(this.globalPluginsDir, projectDir);

    if (!loadResult.ok) {
      return err(new AdevError('cli_plugin_list_failed', '플러그인 목록 로드 실패'));
    }

    const plugins = loadResult.value;

    if (plugins.length === 0) {
      process.stdout.write('설치된 플러그인이 없습니다.\n');
      return ok(undefined);
    }

    process.stdout.write(`\n  설치된 플러그인 (${plugins.length}개):\n\n`);

    for (const plugin of plugins) {
      const { name, version, description } = plugin.manifest;
      const desc = description ? ` — ${description}` : '';
      process.stdout.write(`  ${name}@${version}${desc}\n`);
    }

    process.stdout.write('\n');
    return ok(undefined);
  }

  // ── install ──────────────────────────────────────────────────

  /**
   * 플러그인을 설치한다 / Install a plugin
   *
   * @description
   * KR: npm 패키지명 또는 로컬 경로에서 플러그인을 설치한다.
   *     로컬 경로의 경우 manifest.json을 확인하고 글로벌 플러그인 디렉토리에 복사한다.
   *     npm 패키지의 경우 bun add로 설치 후 manifest를 생성한다.
   * EN: Installs a plugin from npm package name or local path.
   */
  private async handleInstall(
    args: readonly string[],
    projectDir?: string,
  ): Promise<Result<void, AdevError>> {
    const nameOrPath = args[0];

    if (!nameOrPath) {
      return err(
        new AdevError(
          'cli_plugin_install_missing_name',
          '설치할 플러그인 이름 또는 경로를 지정하세요. 예: adev plugin install <name|path>',
        ),
      );
    }

    const isLocalPath = nameOrPath.startsWith('.') || nameOrPath.startsWith('/');
    const targetDir = projectDir ?? this.globalPluginsDir;

    if (isLocalPath) {
      return this.installFromLocal(nameOrPath, targetDir);
    }

    return this.installFromNpm(nameOrPath, targetDir);
  }

  /**
   * 로컬 경로에서 플러그인을 설치한다 / Install plugin from local path
   */
  private async installFromLocal(
    sourcePath: string,
    targetDir: string,
  ): Promise<Result<void, AdevError>> {
    const absSource = resolve(sourcePath);
    const manifestPath = join(absSource, 'manifest.json');

    if (!existsSync(manifestPath)) {
      return err(
        new AdevError('cli_plugin_install_no_manifest', `manifest.json이 없습니다: ${absSource}`),
      );
    }

    let manifest: PluginManifest;
    try {
      const file = Bun.file(manifestPath);
      manifest = (await file.json()) as PluginManifest;
    } catch {
      return err(
        new AdevError(
          'cli_plugin_install_bad_manifest',
          `manifest.json 파싱 실패: ${manifestPath}`,
        ),
      );
    }

    if (!(manifest.name && manifest.version && manifest.entryPoint)) {
      return err(
        new AdevError(
          'cli_plugin_install_invalid_manifest',
          'manifest.json에 name, version, entryPoint 필드가 필요합니다.',
        ),
      );
    }

    const destDir = join(targetDir, manifest.name);
    await mkdir(destDir, { recursive: true });

    // WHY: Bun.$ 쉘을 사용하여 cp -r 수행 — 재귀적 복사를 안전하게 처리
    const cpResult = Bun.spawnSync(['cp', '-r', `${absSource}/.`, destDir]);
    if (cpResult.exitCode !== 0) {
      return err(
        new AdevError(
          'cli_plugin_install_copy_failed',
          `플러그인 복사 실패: ${absSource} → ${destDir}`,
        ),
      );
    }

    this.logger.info('로컬 플러그인 설치 완료', { name: manifest.name, dest: destDir });
    process.stdout.write(`✓ ${manifest.name}@${manifest.version} 설치 완료 (${destDir})\n`);
    return ok(undefined);
  }

  /**
   * npm 레지스트리에서 플러그인을 설치한다 / Install plugin from npm registry
   */
  private async installFromNpm(
    packageName: string,
    targetDir: string,
  ): Promise<Result<void, AdevError>> {
    await mkdir(targetDir, { recursive: true });

    this.logger.info('npm에서 플러그인 설치 중', { package: packageName });
    process.stdout.write(`${packageName} 설치 중...\n`);

    const installResult = Bun.spawnSync(['bun', 'add', packageName], {
      cwd: targetDir,
    });

    if (installResult.exitCode !== 0) {
      const stderr = installResult.stderr.toString();
      return err(
        new AdevError('cli_plugin_install_npm_failed', `bun add 실패: ${packageName}\n${stderr}`),
      );
    }

    // WHY: bun add 후 node_modules에서 manifest.json을 확인하여 플러그인 디렉토리에 복사
    const nmDir = join(targetDir, 'node_modules', packageName);
    const nmManifest = join(nmDir, 'manifest.json');

    if (existsSync(nmManifest)) {
      const pluginDir = join(targetDir, packageName);
      await mkdir(pluginDir, { recursive: true });
      Bun.spawnSync(['cp', '-r', `${nmDir}/.`, pluginDir]);
    }

    this.logger.info('npm 플러그인 설치 완료', { package: packageName });
    process.stdout.write(`✓ ${packageName} 설치 완료\n`);
    return ok(undefined);
  }

  // ── remove ───────────────────────────────────────────────────

  /**
   * 플러그인을 제거한다 / Remove a plugin
   */
  private async handleRemove(args: readonly string[]): Promise<Result<void, AdevError>> {
    const pluginName = args[0];

    if (!pluginName) {
      return err(
        new AdevError(
          'cli_plugin_remove_missing_name',
          '제거할 플러그인 이름을 지정하세요. 예: adev plugin remove <name>',
        ),
      );
    }

    const pluginDir = join(this.globalPluginsDir, pluginName);

    if (!existsSync(pluginDir)) {
      return err(
        new AdevError('cli_plugin_remove_not_found', `플러그인을 찾을 수 없습니다: ${pluginName}`),
      );
    }

    await rm(pluginDir, { recursive: true, force: true });

    this.logger.info('플러그인 제거 완료', { name: pluginName });
    process.stdout.write(`✓ ${pluginName} 제거 완료\n`);
    return ok(undefined);
  }

  // ── create ───────────────────────────────────────────────────

  /**
   * 플러그인 보일러플레이트를 생성한다 / Scaffold plugin boilerplate
   */
  private async handleCreate(args: readonly string[]): Promise<Result<void, AdevError>> {
    const pluginName = args[0];

    if (!pluginName) {
      return err(
        new AdevError(
          'cli_plugin_create_missing_name',
          '생성할 플러그인 이름을 지정하세요. 예: adev plugin create <name>',
        ),
      );
    }

    if (!/^[a-z][a-z0-9-]*$/.test(pluginName)) {
      return err(
        new AdevError(
          'cli_plugin_create_invalid_name',
          `유효하지 않은 플러그인 이름: '${pluginName}'. 소문자, 숫자, 하이픈만 사용 가능하며 소문자로 시작해야 합니다.`,
        ),
      );
    }

    const pluginDir = join(process.cwd(), pluginName);

    if (existsSync(pluginDir)) {
      return err(
        new AdevError('cli_plugin_create_exists', `디렉토리가 이미 존재합니다: ${pluginDir}`),
      );
    }

    await mkdir(pluginDir, { recursive: true });

    const manifest: PluginManifest = {
      name: pluginName,
      version: '0.1.0',
      description: `${pluginName} adev plugin`,
      entryPoint: 'index.ts',
    };

    await writeFile(
      join(pluginDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf-8',
    );

    const indexContent = `import type { AdevPlugin } from 'core/plugin-types.js';

/**
 * ${pluginName} 플러그인 / ${pluginName} plugin
 */
const plugin: AdevPlugin = {
  async onInit(ctx) {
    ctx.logger.info('${pluginName} 초기화 완료');
  },

  async onPhaseChange(ctx, info) {
    ctx.logger.debug('Phase 전환', { from: info.from, to: info.to });
  },

  async onComplete(ctx, result) {
    ctx.logger.info(\`파이프라인 \${result.success ? '성공' : '실패'}\`);
  },

  async onDestroy(ctx) {
    ctx.logger.info('${pluginName} 해제');
  },
};

export default plugin;
`;

    await writeFile(join(pluginDir, 'index.ts'), indexContent, 'utf-8');

    this.logger.info('플러그인 스캐폴딩 완료', { name: pluginName, dir: pluginDir });
    process.stdout.write(`\n  ✓ 플러그인 '${pluginName}' 생성 완료\n\n`);
    process.stdout.write(`  ${pluginDir}/\n`);
    process.stdout.write('  ├── manifest.json\n');
    process.stdout.write('  └── index.ts\n\n');
    process.stdout.write(`  설치: adev plugin install ./${pluginName}\n\n`);
    return ok(undefined);
  }

  // ── 유틸리티 / Utilities ──────────────────────────────────────

  /**
   * 프로젝트 플러그인 디렉토리를 결정한다 / Resolve project plugins directory
   */
  private resolveProjectPluginsDir(options: CliOptions): string | undefined {
    const projectPath = options.projectPath ?? options.flags['project-path'];
    if (typeof projectPath === 'string') {
      return join(projectPath, PROJECT_PLUGINS_DIR);
    }
    const cwd = process.cwd();
    const projectPluginsDir = join(cwd, PROJECT_PLUGINS_DIR);
    return existsSync(join(cwd, '.adev')) ? projectPluginsDir : undefined;
  }
}
