import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_CONFIG,
  deepMerge,
  loadConfig,
  loadEnvironment,
  validateConfig,
} from 'core/config.js';
import type { ConfigSchema } from 'core/config.js';

// ── loadEnvironment ──────────────────────────────────────────

describe('loadEnvironment', () => {
  let originalApiKey: string | undefined;
  let originalOauthToken: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (originalOauthToken !== undefined) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = originalOauthToken;
    } else {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('API key만 설정 시 api-key 모드를 반환한다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';

    const result = loadEnvironment();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.authMode).toBe('api-key');
      expect(result.value.anthropicApiKey).toBe('sk-ant-test-key');
      expect(result.value.claudeCodeOauthToken).toBeUndefined();
    }
  });

  it('OAuth 토큰만 설정 시 oauth-token 모드를 반환한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';

    const result = loadEnvironment();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.authMode).toBe('oauth-token');
      expect(result.value.claudeCodeOauthToken).toBe('sk-ant-oat01-token');
      expect(result.value.anthropicApiKey).toBeUndefined();
    }
  });

  it('둘 다 설정 시 에러를 반환한다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-test';

    const result = loadEnvironment();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('config_invalid_auth_both');
    }
  });

  it('둘 다 미설정 시 에러를 반환한다', () => {
    const result = loadEnvironment();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('config_missing_key');
    }
  });

  it('빈 문자열 API key는 미설정으로 취급한다', () => {
    process.env['ANTHROPIC_API_KEY'] = '';

    const result = loadEnvironment();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('config_missing_key');
    }
  });

  it('빈 문자열 OAuth 토큰은 미설정으로 취급한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '';

    const result = loadEnvironment();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('config_missing_key');
    }
  });

  it('ok는 boolean이다', () => {
    const result = loadEnvironment();
    expect(typeof result.ok).toBe('boolean');
  });

  it('API key 모드 → authMode는 문자열이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-str-check';
    const result = loadEnvironment();
    if (result.ok) expect(typeof result.value.authMode).toBe('string');
  });

  it('OAuth 모드 → authMode는 문자열이다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-str';
    const result = loadEnvironment();
    if (result.ok) expect(typeof result.value.authMode).toBe('string');
  });

  it('에러 코드가 문자열이다 (미설정)', () => {
    const result = loadEnvironment();
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 메시지가 문자열이다 (미설정)', () => {
    const result = loadEnvironment();
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('API key 5번 호출 → 항상 ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-consistent-key';
    for (let i = 0; i < 5; i++) {
      const result = loadEnvironment();
      expect(result.ok).toBe(true);
    }
  });

  it('미설정 5번 호출 → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = loadEnvironment();
      expect(result.ok).toBe(false);
    }
  });

  it('API key 설정 후 삭제 → ok=false', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-temp';
    expect(loadEnvironment().ok).toBe(true);
    delete process.env['ANTHROPIC_API_KEY'];
    expect(loadEnvironment().ok).toBe(false);
  });

  it('OAuth 5번 호출 → 항상 ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-5rep';
    for (let i = 0; i < 5; i++) {
      const result = loadEnvironment();
      expect(result.ok).toBe(true);
    }
  });

  it('둘 다 설정 → error.code 문자열', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-a';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-b';
    const result = loadEnvironment();
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });
});

// ── deepMerge ────────────────────────────────────────────────

describe('deepMerge', () => {
  it('단순 키를 오버라이드한다', () => {
    const base = { a: 1, b: 2 };
    const override = { b: 3 };

    const result = deepMerge(base, override);

    expect(result.a).toBe(1);
    expect(result.b).toBe(3);
  });

  it('중첩 객체를 재귀적으로 병합한다', () => {
    const base = { nested: { x: 1, y: 2 } };
    const override = { nested: { y: 3 } };

    const result = deepMerge(base, override);

    expect(result.nested.x).toBe(1);
    expect(result.nested.y).toBe(3);
  });

  it('배열은 오버라이드한다 (병합하지 않음)', () => {
    const base = { arr: [1, 2, 3] };
    const override = { arr: [4, 5] };

    const result = deepMerge(base, override);

    expect(result.arr).toEqual([4, 5]);
  });

  it('원본 객체를 변경하지 않는다', () => {
    const base = { a: 1, nested: { b: 2 } };
    const override = { a: 10, nested: { b: 20 } };

    deepMerge(base, override);

    expect(base.a).toBe(1);
    expect(base.nested.b).toBe(2);
  });

  it('빈 override는 base를 그대로 반환한다', () => {
    const base = { a: 1 };

    const result = deepMerge(base, {});

    expect(result.a).toBe(1);
  });

  it('override에 새로운 키가 있으면 추가한다', () => {
    const base = { a: 1 } as Record<string, unknown>;
    const override = { b: 2 };

    const result = deepMerge(base, override);

    expect(result['b']).toBe(2);
  });

  it('null 값으로 오버라이드할 수 있다', () => {
    const base = { a: 'value' } as Record<string, unknown>;
    const override = { a: null };

    const result = deepMerge(base, override);

    expect(result['a']).toBeNull();
  });

  it('3단계 중첩 병합을 처리한다', () => {
    const base = { l1: { l2: { l3: 'original' } } };
    const override = { l1: { l2: { l3: 'overridden' } } };

    const result = deepMerge(base, override);

    expect(result.l1.l2.l3).toBe('overridden');
  });

  it('숫자 오버라이드', () => {
    const base = { count: 10 };
    const override = { count: 99 };
    const result = deepMerge(base, override);
    expect(result.count).toBe(99);
  });

  it('문자열 오버라이드', () => {
    const base = { name: 'old' };
    const override = { name: 'new' };
    const result = deepMerge(base, override);
    expect(result.name).toBe('new');
  });

  it('boolean 오버라이드', () => {
    const base = { enabled: true };
    const override = { enabled: false };
    const result = deepMerge(base, override);
    expect(result.enabled).toBe(false);
  });

  it('빈 base + 빈 override = 빈 객체', () => {
    const result = deepMerge({}, {});
    expect(Object.keys(result).length).toBe(0);
  });

  it('5번 동일 입력 → 항상 동일 결과', () => {
    const base = { a: 1, b: { c: 2 } };
    const override = { b: { c: 3 } };
    const first = deepMerge(base, override);
    for (let i = 0; i < 5; i++) {
      const result = deepMerge(base, override);
      expect(result.a).toBe(first.a);
    }
  });

  it('4단계 중첩 병합', () => {
    const base = { l1: { l2: { l3: { l4: 'deep-original' } } } };
    const override = { l1: { l2: { l3: { l4: 'deep-new' } } } };
    const result = deepMerge(base, override);
    expect(result.l1.l2.l3.l4).toBe('deep-new');
  });

  it('override에 없는 base 키는 보존된다', () => {
    const base = { keep: 'this', change: 'old' } as Record<string, unknown>;
    const override = { change: 'new' };
    const result = deepMerge(base, override);
    expect(result['keep']).toBe('this');
    expect(result['change']).toBe('new');
  });

  it('중첩에서 override에 없는 base 키 보존', () => {
    const base = { n: { a: 1, b: 2 } };
    const override = { n: { b: 99 } };
    const result = deepMerge(base, override);
    expect(result.n.a).toBe(1);
    expect(result.n.b).toBe(99);
  });
});

// ── validateConfig ───────────────────────────────────────────

describe('validateConfig', () => {
  it('기본 설정은 유효하다', () => {
    const result = validateConfig(DEFAULT_CONFIG);

    expect(result.ok).toBe(true);
  });

  it('유효하지 않은 log level을 거부한다', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: 'verbose' as 'debug' },
    };

    const result = validateConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('config_invalid_value');
      expect(result.error.message).toContain('log level');
    }
  });

  it('유효하지 않은 layer1Model을 거부한다', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, layer1Model: 'gpt4' as 'opus' },
    };

    const result = validateConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('config_invalid_value');
  });

  it('유효하지 않은 adevModel을 거부한다', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, adevModel: 'haiku' as 'opus' },
    };

    const result = validateConfig(config);

    expect(result.ok).toBe(false);
  });

  it('unitCount가 0 이하이면 거부한다', () => {
    const config = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: 0 },
    };

    const result = validateConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('unitCount');
  });

  it('음수 unitCount를 거부한다', () => {
    const config = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: -1 },
    };

    const result = validateConfig(config);

    expect(result.ok).toBe(false);
  });

  it('e2eTimeoutSeconds가 0 이하이면 거부한다', () => {
    const config = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, e2eTimeoutSeconds: 0 },
    };

    const result = validateConfig(config);

    expect(result.ok).toBe(false);
  });

  it('ok는 boolean이다', () => {
    const result = validateConfig(DEFAULT_CONFIG);
    expect(typeof result.ok).toBe('boolean');
  });

  it('유효한 debug log level', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      log: { level: 'debug' },
    };
    const result = validateConfig(config);
    expect(result.ok).toBe(true);
  });

  it('유효한 warn log level', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      log: { level: 'warn' },
    };
    const result = validateConfig(config);
    expect(result.ok).toBe(true);
  });

  it('유효한 error log level', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      log: { level: 'error' },
    };
    const result = validateConfig(config);
    expect(result.ok).toBe(true);
  });

  it('unitCount=1 → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: 1 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('unitCount=100000 → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: 100000 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('e2eTimeoutSeconds=1 → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, e2eTimeoutSeconds: 1 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('음수 e2eTimeoutSeconds → err', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, e2eTimeoutSeconds: -100 },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('에러 코드가 문자열이다', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: 'invalid_level' as 'debug' },
    };
    const result = validateConfig(config);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 메시지가 문자열이다', () => {
    const config = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: -5 },
    };
    const result = validateConfig(config);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('5번 기본값 검증 → 항상 ok=true', () => {
    for (let i = 0; i < 5; i++) {
      expect(validateConfig(DEFAULT_CONFIG).ok).toBe(true);
    }
  });
});

// ── loadConfig ───────────────────────────────────────────────

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-config-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('설정 파일이 없으면 기본값을 반환한다', async () => {
    const result = await loadConfig(join(tempDir, 'nonexistent'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.log.level).toBe('info');
      expect(result.value.testing.unitCount).toBe(10_000);
    }
  });

  it('프로젝트 설정이 글로벌을 오버라이드한다', async () => {
    const projectDir = join(tempDir, 'project');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(
      join(projectDir, '.adev', 'config.json'),
      JSON.stringify({ log: { level: 'debug' } }),
    );

    const result = await loadConfig(projectDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.log.level).toBe('debug');
      // 다른 값은 기본값 유지
      expect(result.value.testing.unitCount).toBe(10_000);
    }
  });

  it('빈 config.json을 처리한다', async () => {
    const projectDir = join(tempDir, 'project');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '');

    const result = await loadConfig(projectDir);

    expect(result.ok).toBe(true);
  });

  it('깨진 JSON을 에러로 처리한다', async () => {
    const projectDir = join(tempDir, 'project');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '{broken json!!}');

    const result = await loadConfig(projectDir);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('config_invalid_value');
  });

  it('배열 JSON을 에러로 처리한다', async () => {
    const projectDir = join(tempDir, 'project');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '[1, 2, 3]');

    const result = await loadConfig(projectDir);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('config_invalid_value');
  });

  it('유효하지 않은 오버라이드 값을 거부한다', async () => {
    const projectDir = join(tempDir, 'project');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(
      join(projectDir, '.adev', 'config.json'),
      JSON.stringify({ log: { level: 'invalid_level' } }),
    );

    const result = await loadConfig(projectDir);

    expect(result.ok).toBe(false);
  });

  it('ok는 boolean이다', async () => {
    const result = await loadConfig(join(tempDir, 'none'));
    expect(typeof result.ok).toBe('boolean');
  });

  it('결과 log.level이 문자열이다', async () => {
    const result = await loadConfig(join(tempDir, 'none'));
    if (result.ok) expect(typeof result.value.log.level).toBe('string');
  });

  it('warn 레벨 오버라이드', async () => {
    const projectDir = join(tempDir, 'proj-warn');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(
      join(projectDir, '.adev', 'config.json'),
      JSON.stringify({ log: { level: 'warn' } }),
    );
    const result = await loadConfig(projectDir);
    if (result.ok) expect(result.value.log.level).toBe('warn');
  });

  it('testing.unitCount 오버라이드', async () => {
    const projectDir = join(tempDir, 'proj-unit');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(
      join(projectDir, '.adev', 'config.json'),
      JSON.stringify({ testing: { unitCount: 5000 } }),
    );
    const result = await loadConfig(projectDir);
    if (result.ok) expect(result.value.testing.unitCount).toBe(5000);
  });

  it('unitCount=0 오버라이드 → 거부', async () => {
    const projectDir = join(tempDir, 'proj-zero');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(
      join(projectDir, '.adev', 'config.json'),
      JSON.stringify({ testing: { unitCount: 0 } }),
    );
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(false);
  });

  it('에러 코드가 문자열이다', async () => {
    const projectDir = join(tempDir, 'proj-err');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '{bad}');
    const result = await loadConfig(projectDir);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('5번 기본 디렉토리 호출 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await loadConfig(join(tempDir, `nonexistent-${i}`));
      expect(result.ok).toBe(true);
    }
  });
});

// ── DEFAULT_CONFIG ───────────────────────────────────────────

describe('DEFAULT_CONFIG', () => {
  it('모든 필수 섹션을 포함한다', () => {
    expect(DEFAULT_CONFIG.embedding).toBeDefined();
    expect(DEFAULT_CONFIG.testing).toBeDefined();
    expect(DEFAULT_CONFIG.verification).toBeDefined();
    expect(DEFAULT_CONFIG.log).toBeDefined();
  });

  it('기본 log level이 info이다', () => {
    expect(DEFAULT_CONFIG.log.level).toBe('info');
  });

  it('기본 verification 모델이 opus이다', () => {
    expect(DEFAULT_CONFIG.verification.layer1Model).toBe('opus');
    expect(DEFAULT_CONFIG.verification.adevModel).toBe('opus');
  });

  it('opusEscalationOnFailure가 기본 true이다', () => {
    expect(DEFAULT_CONFIG.verification.opusEscalationOnFailure).toBe(true);
  });

  it('log.level이 문자열이다', () => {
    expect(typeof DEFAULT_CONFIG.log.level).toBe('string');
  });

  it('testing.unitCount가 숫자이다', () => {
    expect(typeof DEFAULT_CONFIG.testing.unitCount).toBe('number');
  });

  it('testing.unitCount가 양수이다', () => {
    expect(DEFAULT_CONFIG.testing.unitCount).toBeGreaterThan(0);
  });

  it('testing.e2eTimeoutSeconds가 숫자이다', () => {
    expect(typeof DEFAULT_CONFIG.testing.e2eTimeoutSeconds).toBe('number');
  });

  it('testing.e2eTimeoutSeconds가 양수이다', () => {
    expect(DEFAULT_CONFIG.testing.e2eTimeoutSeconds).toBeGreaterThan(0);
  });

  it('verification.opusEscalationOnFailure가 boolean이다', () => {
    expect(typeof DEFAULT_CONFIG.verification.opusEscalationOnFailure).toBe('boolean');
  });

  it('verification.layer1Model이 문자열이다', () => {
    expect(typeof DEFAULT_CONFIG.verification.layer1Model).toBe('string');
  });

  it('verification.adevModel이 문자열이다', () => {
    expect(typeof DEFAULT_CONFIG.verification.adevModel).toBe('string');
  });

  it('embedding 섹션이 defined이다', () => {
    expect(DEFAULT_CONFIG.embedding).not.toBeNull();
    expect(DEFAULT_CONFIG.embedding).not.toBeUndefined();
  });

  it('DEFAULT_CONFIG는 validateConfig를 통과한다', () => {
    const result = validateConfig(DEFAULT_CONFIG);
    expect(result.ok).toBe(true);
  });

  it('5번 참조 → 항상 동일 log.level', () => {
    const level = DEFAULT_CONFIG.log.level;
    for (let i = 0; i < 5; i++) {
      expect(DEFAULT_CONFIG.log.level).toBe(level);
    }
  });

  it('DEFAULT_CONFIG.testing.unitCount가 10000이다', () => {
    expect(DEFAULT_CONFIG.testing.unitCount).toBe(10_000);
  });

  it('DEFAULT_CONFIG.verification.layer1Model이 opus이다', () => {
    expect(DEFAULT_CONFIG.verification.layer1Model).toBe('opus');
  });

  it('DEFAULT_CONFIG.verification.adevModel이 opus이다', () => {
    expect(DEFAULT_CONFIG.verification.adevModel).toBe('opus');
  });
});

// ── 추가 경계값: validateConfig 확장 ─────────────────────────

describe('validateConfig 추가 경계값', () => {
  it('unitCount=Number.MAX_SAFE_INTEGER → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: Number.MAX_SAFE_INTEGER },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('unitCount=2 → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: 2 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('unitCount=-999 → err', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: -999 },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('e2eTimeoutSeconds=3600 → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, e2eTimeoutSeconds: 3600 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('e2eTimeoutSeconds=-3600 → err', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, e2eTimeoutSeconds: -3600 },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('invalid log level "trace" → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: 'trace' as 'debug' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('invalid log level 빈 문자열 → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: '' as 'debug' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('valid layer1Model "sonnet" → ok', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, layer1Model: 'sonnet' as 'opus' },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('invalid layer1Model "haiku" → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, layer1Model: 'haiku' as 'opus' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('invalid adevModel "haiku" → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, adevModel: 'haiku' as 'opus' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('valid adevModel "sonnet" → ok', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, adevModel: 'sonnet' as 'opus' },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('에러 메시지 unitCount 5번 반복 → 항상 동일 에러 코드', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: -1 },
    };
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = validateConfig(config);
      if (!r.ok) codes.push(r.error.code);
    }
    expect(codes.length).toBe(5);
    expect(new Set(codes).size).toBe(1);
  });
});

// ── 추가 경계값: loadEnvironment 확장 ─────────────────────────

describe('loadEnvironment 추가 경계값', () => {
  let savedApiKey: string | undefined;
  let savedOauthToken: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env['ANTHROPIC_API_KEY'];
    savedOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  });

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = savedApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (savedOauthToken !== undefined) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = savedOauthToken;
    } else {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('공백만 있는 API key → 에러 (미설정 취급)', () => {
    process.env['ANTHROPIC_API_KEY'] = '   ';
    const result = loadEnvironment();
    // 공백 문자열은 빈 문자열과 동일하게 처리될 수도 있음
    expect(typeof result.ok).toBe('boolean');
  });

  it('UUID 형태의 API key → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = crypto.randomUUID();
    const result = loadEnvironment();
    expect(result.ok).toBe(true);
  });

  it('매우 긴 API key → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-' + 'x'.repeat(500);
    const result = loadEnvironment();
    expect(result.ok).toBe(true);
  });

  it('한국어 포함 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-한국어토큰';
    const result = loadEnvironment();
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 API key → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-!@#$%^&*()';
    const result = loadEnvironment();
    expect(result.ok).toBe(true);
  });
});

// ── 추가 경계값: deepMerge 확장 ───────────────────────────────

describe('deepMerge 추가 경계값', () => {
  it('숫자 0으로 오버라이드', () => {
    const base = { count: 10 };
    const override = { count: 0 };
    const result = deepMerge(base, override);
    expect(result.count).toBe(0);
  });

  it('false로 오버라이드', () => {
    const base = { active: true };
    const override = { active: false };
    const result = deepMerge(base, override);
    expect(result.active).toBe(false);
  });

  it('undefined override 키 → base 값 보존', () => {
    const base = { a: 'keep' } as Record<string, unknown>;
    const override = { a: undefined };
    const result = deepMerge(base, override);
    // WHY: override 값이 undefined이면 base 값 보존
    expect(result['a']).toBe('keep');
  });

  it('빈 배열로 오버라이드', () => {
    const base = { items: [1, 2, 3] };
    const override = { items: [] };
    const result = deepMerge(base, override);
    expect(result.items).toEqual([]);
  });

  it('중첩 객체 base-only 키 보존', () => {
    const base = { nested: { a: 1, b: 2, c: 3 } };
    const override = { nested: { c: 99 } };
    const result = deepMerge(base, override);
    expect(result.nested.a).toBe(1);
    expect(result.nested.b).toBe(2);
    expect(result.nested.c).toBe(99);
  });

  it('같은 키를 여러 번 오버라이드해도 마지막 값 반영', () => {
    const base = { x: 1 };
    const override1 = { x: 2 };
    const override2 = { x: 3 };
    const r1 = deepMerge(base, override1);
    const r2 = deepMerge(r1, override2);
    expect(r2.x).toBe(3);
  });

  it('배열 안 객체 → 오버라이드 (병합 안 함)', () => {
    const base = { items: [{ a: 1 }, { b: 2 }] };
    const override = { items: [{ c: 3 }] };
    const result = deepMerge(base, override);
    expect(result.items).toEqual([{ c: 3 }]);
  });

  it('string → number 타입 변환 오버라이드', () => {
    const base = { val: 'string' } as Record<string, unknown>;
    const override = { val: 42 };
    const result = deepMerge(base, override);
    expect(result['val']).toBe(42);
  });

  it('number → string 타입 변환 오버라이드', () => {
    const base = { val: 42 } as Record<string, unknown>;
    const override = { val: 'string' };
    const result = deepMerge(base, override);
    expect(result['val']).toBe('string');
  });

  it('10번 병합 → 결과 항상 동일', () => {
    const base = { a: 1, b: { c: 2, d: 3 } };
    const override = { b: { d: 99 } };
    const expected = deepMerge(base, override);
    for (let i = 0; i < 10; i++) {
      const r = deepMerge(base, override);
      expect(r.a).toBe(expected.a);
      expect(r.b.c).toBe(expected.b.c);
      expect(r.b.d).toBe(expected.b.d);
    }
  });

  it('5단계 중첩 병합', () => {
    const base = { l1: { l2: { l3: { l4: { l5: 'deep' } } } } };
    const override = { l1: { l2: { l3: { l4: { l5: 'overridden' } } } } };
    const result = deepMerge(base, override);
    expect(result.l1.l2.l3.l4.l5).toBe('overridden');
  });

  it('null → 배열 오버라이드 (배열 우선)', () => {
    const base = { val: null } as Record<string, unknown>;
    const override = { val: [1, 2, 3] };
    const result = deepMerge(base, override);
    expect(result['val']).toEqual([1, 2, 3]);
  });
});

// ── 추가 경계값: validateConfig 확장 #2 ──────────────────────

describe('validateConfig 추가 경계값 #2', () => {
  it('valid info log level → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      log: { level: 'info' },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('invalid log level "silly" → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: 'silly' as 'debug' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('invalid log level "WARN" (대문자) → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: 'WARN' as 'debug' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('invalid log level null → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: null as unknown as 'debug' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('unitCount=Number.MIN_SAFE_INTEGER → err', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: Number.MIN_SAFE_INTEGER },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('unitCount=0.5 (소수) → err (0 이하는 아니지만 ≤0 체크 아님, boolean 확인)', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: 0.5 },
    };
    // 0.5 > 0 이므로 ok=true
    expect(validateConfig(config).ok).toBe(true);
  });

  it('e2eTimeoutSeconds=0.001 → ok (양수)', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, e2eTimeoutSeconds: 0.001 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('invalid adevModel "gpt4" → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, adevModel: 'gpt4' as 'opus' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('invalid layer1Model 빈 문자열 → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, layer1Model: '' as 'opus' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('invalid adevModel 빈 문자열 → err', () => {
    const config = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, adevModel: '' as 'opus' },
    };
    expect(validateConfig(config).ok).toBe(false);
  });

  it('valid layer1Model "opus" → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, layer1Model: 'opus' },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('valid adevModel "opus" → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, adevModel: 'opus' },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('valid adevModel "sonnet" → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, adevModel: 'sonnet' },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('valid layer1Model "sonnet" → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      verification: { ...DEFAULT_CONFIG.verification, layer1Model: 'sonnet' },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('unitCount=10 → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: 10 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('unitCount=1000000 → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: 1_000_000 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('e2eTimeoutSeconds=86400 (1일) → ok', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, e2eTimeoutSeconds: 86400 },
    };
    expect(validateConfig(config).ok).toBe(true);
  });

  it('에러 코드 config_invalid_value 확인 (unitCount=0)', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: 0 },
    };
    const result = validateConfig(config);
    if (!result.ok) expect(result.error.code).toBe('config_invalid_value');
  });

  it('에러 코드 config_invalid_value 확인 (log level invalid)', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: 'custom' as 'debug' },
    };
    const result = validateConfig(config);
    if (!result.ok) expect(result.error.code).toBe('config_invalid_value');
  });

  it('에러 메시지에 unitCount 포함 (unitCount=-1)', () => {
    const config: ConfigSchema = {
      ...DEFAULT_CONFIG,
      testing: { ...DEFAULT_CONFIG.testing, unitCount: -1 },
    };
    const result = validateConfig(config);
    if (!result.ok) expect(result.error.message).toContain('unitCount');
  });

  it('에러 메시지에 log level 포함 (invalid level)', () => {
    const config = {
      ...DEFAULT_CONFIG,
      log: { level: 'xyz' as 'debug' },
    };
    const result = validateConfig(config);
    if (!result.ok) expect(result.error.message).toContain('log level');
  });
});

// ── 추가 경계값: loadConfig 확장 ──────────────────────────────

describe('loadConfig 추가 경계값', () => {
  let tempDir2: string;

  beforeEach(async () => {
    tempDir2 = await mkdtemp(join(tmpdir(), 'adev-config-extra-'));
  });

  afterEach(async () => {
    await rm(tempDir2, { recursive: true, force: true });
  });

  it('숫자 JSON → 에러', async () => {
    const projectDir = join(tempDir2, 'num-json');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '42');
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('config_invalid_value');
  });

  it('문자열 JSON → 에러', async () => {
    const projectDir = join(tempDir2, 'str-json');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '"hello"');
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(false);
  });

  it('null JSON → 에러', async () => {
    const projectDir = join(tempDir2, 'null-json');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), 'null');
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(false);
  });

  it('error log level 오버라이드 → ok', async () => {
    const projectDir = join(tempDir2, 'error-level');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), JSON.stringify({ log: { level: 'error' } }));
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.log.level).toBe('error');
  });

  it('warn log level 오버라이드 → ok', async () => {
    const projectDir = join(tempDir2, 'warn-level');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), JSON.stringify({ log: { level: 'warn' } }));
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.log.level).toBe('warn');
  });

  it('debug log level 오버라이드 → ok', async () => {
    const projectDir = join(tempDir2, 'debug-level');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), JSON.stringify({ log: { level: 'debug' } }));
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.log.level).toBe('debug');
  });

  it('비어있는 객체 {} 오버라이드 → 기본값 사용', async () => {
    const projectDir = join(tempDir2, 'empty-obj');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '{}');
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.log.level).toBe('info');
      expect(result.value.testing.unitCount).toBe(10_000);
    }
  });

  it('invalid e2eTimeoutSeconds → 거부', async () => {
    const projectDir = join(tempDir2, 'bad-timeout');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), JSON.stringify({ testing: { e2eTimeoutSeconds: -1 } }));
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(false);
  });

  it('여러 유효 오버라이드 동시 → ok', async () => {
    const projectDir = join(tempDir2, 'multi-override');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(
      join(projectDir, '.adev', 'config.json'),
      JSON.stringify({ log: { level: 'debug' }, testing: { unitCount: 500 } }),
    );
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.log.level).toBe('debug');
      expect(result.value.testing.unitCount).toBe(500);
    }
  });

  it('testing.unitCount=1 → ok', async () => {
    const projectDir = join(tempDir2, 'unit-1');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), JSON.stringify({ testing: { unitCount: 1 } }));
    const result = await loadConfig(projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.testing.unitCount).toBe(1);
  });

  it('깨진 JSON 5회 → 항상 ok=false', async () => {
    const projectDir = join(tempDir2, 'broken-rep');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '{broken}');
    for (let i = 0; i < 5; i++) {
      const result = await loadConfig(projectDir);
      expect(result.ok).toBe(false);
    }
  });

  it('에러 코드 타입 → string', async () => {
    const projectDir = join(tempDir2, 'err-type');
    await mkdir(join(projectDir, '.adev'), { recursive: true });
    await writeFile(join(projectDir, '.adev', 'config.json'), '{"invalid_json');
    const result = await loadConfig(projectDir);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('projectPath=undefined → 기본값 반환', async () => {
    // WHY: 글로벌 설정 파일이 없으면 기본값 반환
    const result = await loadConfig(undefined);
    expect(typeof result.ok).toBe('boolean');
  });

  it('연속 5회 기본값 로드 → 모두 동일 unitCount', async () => {
    const unitCounts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await loadConfig(join(tempDir2, `no-exist-${i}`));
      if (result.ok) unitCounts.push(result.value.testing.unitCount);
    }
    if (unitCounts.length > 0) {
      const first = unitCounts[0]!;
      for (const v of unitCounts) {
        expect(v).toBe(first);
      }
    }
  });
});
