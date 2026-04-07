/**
 * E2E Smoke Test: adev init -> adev start -> verify output
 *
 * Tests the complete CLI flow from project initialization to
 * pipeline execution. Gated behind ADEV_E2E_SMOKE=1 env var
 * since it requires a valid ANTHROPIC_API_KEY.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { $ } from 'bun';

const SMOKE_ENABLED = process.env.ADEV_E2E_SMOKE === '1';
const CLI_PATH = join(import.meta.dir, '../../dist/cli.js');

describe.skipIf(!SMOKE_ENABLED)('Smoke Test: init -> start -> verify', () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'adev-smoke-'));
  });

  afterAll(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test(
    'adev init creates .adev/config.json',
    async () => {
      const result = await $`bun ${CLI_PATH} init --cwd ${testDir} --non-interactive`.quiet();
      expect(result.exitCode).toBe(0);

      const configPath = join(testDir, '.adev', 'config.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(await Bun.file(configPath).text());
      expect(config).toHaveProperty('embedding');
    },
    30_000,
  );

  test(
    'adev config list shows current settings',
    async () => {
      const result = await $`bun ${CLI_PATH} config list --cwd ${testDir}`.quiet();
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain('embedding');
    },
    10_000,
  );

  test(
    'adev start runs pipeline (short timeout for smoke)',
    async () => {
      // Start with a very short timeout — we just verify it launches and
      // produces structured output, not that it completes a full dev cycle.
      const result =
        await $`bun ${CLI_PATH} start --cwd ${testDir} --timeout 15000 --feature "add a hello world function" 2>&1`.nothrow();

      const output = result.stdout.toString();

      // Pipeline should at least start the DESIGN phase
      const started =
        output.includes('DESIGN') ||
        output.includes('phase') ||
        output.includes('pipeline') ||
        result.exitCode === 0;

      expect(started).toBe(true);
    },
    60_000,
  );
});

describe('Smoke Test: CLI help (always runs)', () => {
  test('adev --help returns usage info', async () => {
    const result = await $`bun ${CLI_PATH} --help`.quiet().nothrow();
    const output = result.stdout.toString();
    expect(output).toContain('adev');
  });

  test('adev --version returns version string', async () => {
    const result = await $`bun ${CLI_PATH} --version`.quiet().nothrow();
    const output = result.stdout.toString();
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });
});
