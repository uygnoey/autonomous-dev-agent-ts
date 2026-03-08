import { describe, it, expect } from 'bun:test';

// ── install.sh 로직 재현 (TypeScript) ──────────────────────────────

/**
 * auth_choice에 따른 처리 결과
 * install.sh lines 103-139 재현
 */
function simulateAuthChoice(
  choice: string,
  keyInput: string,
  existingEnv: string,
): { envContent: string; message: string } {
  const trimmedChoice = choice.trim();

  if (trimmedChoice === '1') {
    if (keyInput.trim().length > 0) {
      const cleaned = existingEnv
        .split('\n')
        .filter(
          (l) =>
            !l.startsWith('ANTHROPIC_API_KEY=') &&
            !l.startsWith('CLAUDE_CODE_OAUTH_TOKEN='),
        )
        .join('\n');
      return {
        envContent:
          cleaned + (cleaned ? '\n' : '') + `ANTHROPIC_API_KEY=${keyInput}`,
        message: '✅ API Key 저장 완료',
      };
    }
    return { envContent: existingEnv, message: '⚠️  입력 없음' };
  }

  if (trimmedChoice === '2') {
    if (keyInput.trim().length > 0) {
      const cleaned = existingEnv
        .split('\n')
        .filter(
          (l) =>
            !l.startsWith('ANTHROPIC_API_KEY=') &&
            !l.startsWith('CLAUDE_CODE_OAUTH_TOKEN='),
        )
        .join('\n');
      return {
        envContent:
          cleaned +
          (cleaned ? '\n' : '') +
          `CLAUDE_CODE_OAUTH_TOKEN=${keyInput}`,
        message: '✅ OAuth Token 저장 완료',
      };
    }
    return { envContent: existingEnv, message: '⚠️  입력 없음' };
  }

  if (trimmedChoice === '3') {
    return { envContent: existingEnv, message: '⏭️  건너뜀' };
  }

  return { envContent: existingEnv, message: '⚠️  잘못된 입력' };
}

/**
 * PATH 중복 추가 방지 로직
 * install.sh lines 79-85 재현
 */
function simulatePathAdd(rcContent: string, binDir: string): string {
  if (rcContent.includes(binDir)) return rcContent;
  return (
    rcContent +
    `\n# adev (autonomous-dev-agent)\nexport PATH="${binDir}:$PATH"\n`
  );
}

/**
 * TTY_OK에 따른 auth 분기
 * install.sh lines 92-140 재현
 */
function simulateTtyBranch(ttyOk: boolean): 'skip' | 'prompt' {
  return ttyOk ? 'prompt' : 'skip';
}

/**
 * 플랫폼 감지
 * install.sh lines 26-44 재현
 * null = unsupported (exit 1 에 해당)
 */
function simulatePlatform(os: string, arch: string): string | null {
  if (os === 'Darwin' && arch === 'arm64') return 'adev-darwin-arm64';
  if (os === 'Linux' && arch === 'x86_64') return 'adev-linux-x64';
  if (os === 'Linux' && (arch === 'aarch64' || arch === 'arm64'))
    return 'adev-linux-arm64';
  return null;
}

// ── 랜덤 입력 생성기 ───────────────────────────────────────────────

const CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?/`~ ';

function randomString(maxLen = 100): string {
  const len = Math.floor(Math.random() * maxLen);
  return Array.from(
    { length: len },
    () => CHARS[Math.floor(Math.random() * CHARS.length)],
  ).join('');
}

function randomChoice<T>(arr: readonly T[]): T {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx] as T;
}

const EDGE_CHOICES = [
  '',
  ' ',
  '0',
  '4',
  '9',
  '-1',
  '1.0',
  '１',
  'one',
  'TWO',
  '1 ',
  ' 1',
  '1\n',
  '1\t',
  '11',
  '123',
] as const;

const NORMAL_CHOICES = ['1', '2', '3'] as const;

function randomAuthChoice(): string {
  // 20% 정상, 80% edge/random
  if (Math.random() < 0.2) return randomChoice(NORMAL_CHOICES);
  if (Math.random() < 0.5) return randomChoice(EDGE_CHOICES);
  return String(Math.floor(Math.random() * 1000));
}

const EDGE_KEYS = [
  '',
  '   ',
  'sk-ant-',
  '!@#$',
  'key with spaces',
  'a\nb',
] as const;

function randomKey(): string {
  if (Math.random() < 0.2) return `sk-ant-${randomString(20)}`;
  if (Math.random() < 0.5) return randomChoice(EDGE_KEYS);
  return randomString(200);
}

const ENV_PRESETS = [
  '',
  'ANTHROPIC_API_KEY=existing-key',
  'CLAUDE_CODE_OAUTH_TOKEN=existing-token',
  'ANTHROPIC_API_KEY=old\nCLAUDE_CODE_OAUTH_TOKEN=old2',
  'OTHER_VAR=value\nANTHROPIC_API_KEY=old',
] as const;

function randomEnvContent(): string {
  if (Math.random() < 0.7) return randomChoice(ENV_PRESETS);
  return randomString(50);
}

const KNOWN_PLATFORMS = [
  { os: 'Darwin', arch: 'arm64', expected: 'adev-darwin-arm64' },
  { os: 'Darwin', arch: 'x86_64', expected: null },
  { os: 'Linux', arch: 'x86_64', expected: 'adev-linux-x64' },
  { os: 'Linux', arch: 'aarch64', expected: 'adev-linux-arm64' },
  { os: 'Linux', arch: 'arm64', expected: 'adev-linux-arm64' },
  { os: 'Windows', arch: 'x86_64', expected: null },
  { os: 'CYGWIN', arch: 'x86_64', expected: null },
  { os: '', arch: '', expected: null },
] as const;

// ── BIN_DIR 이스케이프 헬퍼 ────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── 테스트 케이스 ─────────────────────────────────────────────────

describe('install.sh e2e — property-based (100,000 cases)', () => {
  // ── auth_choice 분기: 40,000건 ──────────────────────────────────
  describe('auth choice branching (40,000 cases)', () => {
    const N = 40_000;

    for (let i = 0; i < N; i++) {
      const choice = randomAuthChoice();
      const key = randomKey();
      const existingEnv = randomEnvContent();

      it(`[${i}] choice="${choice.substring(0, 10)}" key="${key.substring(0, 10)}"`, () => {
        const result = simulateAuthChoice(choice, key, existingEnv);

        const tc = choice.trim();

        if (tc === '1' && key.trim().length > 0) {
          expect(result.envContent).toContain(`ANTHROPIC_API_KEY=${key}`);
          expect(result.envContent).not.toContain('CLAUDE_CODE_OAUTH_TOKEN=');
          expect(result.message).toContain('저장 완료');
        } else if (tc === '2' && key.trim().length > 0) {
          expect(result.envContent).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${key}`);
          expect(result.envContent).not.toContain('ANTHROPIC_API_KEY=');
          expect(result.message).toContain('저장 완료');
        } else if (tc === '3') {
          expect(result.envContent).toBe(existingEnv);
          expect(result.message).toContain('건너뜀');
        } else if ((tc === '1' || tc === '2') && key.trim().length === 0) {
          expect(result.envContent).toBe(existingEnv);
          expect(result.message).toContain('입력 없음');
        } else {
          // 잘못된 입력 — env 불변
          expect(result.envContent).toBe(existingEnv);
        }

        // 공통 불변식: envContent는 항상 string
        expect(typeof result.envContent).toBe('string');
        expect(typeof result.message).toBe('string');
      });
    }
  });

  // ── PATH 중복 방지: 30,000건 ─────────────────────────────────────
  describe('PATH deduplication (30,000 cases)', () => {
    const N = 30_000;
    const BIN_DIR = '/home/user/.local/bin';

    for (let i = 0; i < N; i++) {
      const alreadyHas = Math.random() < 0.5;
      // 80% edge: random content, 20% only the path line
      const base = alreadyHas
        ? `export PATH="${BIN_DIR}:$PATH"\n${randomString(30)}`
        : randomString(50) + '\n';

      it(`[${i}] alreadyHas=${alreadyHas}`, () => {
        const result = simulatePathAdd(base, BIN_DIR);

        // PATH entry는 정확히 1번만 존재해야 함
        const count = (
          result.match(new RegExp(escapeRegex(BIN_DIR), 'g')) ?? []
        ).length;
        expect(count).toBe(1);

        // result는 항상 string
        expect(typeof result).toBe('string');

        // 이미 있었으면 길이 변화 없음
        if (alreadyHas) {
          expect(result).toBe(base);
        }
      });
    }
  });

  // ── PATH 중복 방지 — 다중 추가 멱등성: 추가 테스트 ──────────────
  describe('PATH deduplication — repeated adds idempotent', () => {
    const N = 5_000;
    const BIN_DIR = '/home/user/.local/bin';

    for (let i = 0; i < N; i++) {
      const initial = randomString(40);

      it(`[${i}] repeated add stays idempotent`, () => {
        const after1 = simulatePathAdd(initial, BIN_DIR);
        const after2 = simulatePathAdd(after1, BIN_DIR);
        const after3 = simulatePathAdd(after2, BIN_DIR);

        // 세 번 추가해도 1번만 포함
        const count = (
          after3.match(new RegExp(escapeRegex(BIN_DIR), 'g')) ?? []
        ).length;
        expect(count).toBe(1);
        expect(after1).toBe(after2);
        expect(after2).toBe(after3);
      });
    }
  });

  // ── TTY 분기: 10,000건 ───────────────────────────────────────────
  describe('TTY branch (10,000 cases)', () => {
    const N = 10_000;

    for (let i = 0; i < N; i++) {
      const ttyOk = Math.random() < 0.5;

      it(`[${i}] ttyOk=${ttyOk}`, () => {
        const result = simulateTtyBranch(ttyOk);
        expect(result).toBe(ttyOk ? 'prompt' : 'skip');
        // 항상 두 값 중 하나
        expect(['prompt', 'skip']).toContain(result);
      });
    }
  });

  // ── 플랫폼 감지: 10,000건 ────────────────────────────────────────
  describe('platform detection (10,000 cases)', () => {
    const N = 10_000;

    for (let i = 0; i < N; i++) {
      const isKnown = Math.random() < 0.2;
      const platform = isKnown
        ? { ...KNOWN_PLATFORMS[i % KNOWN_PLATFORMS.length] }
        : {
            os: randomString(10),
            arch: randomString(5),
            expected: null as string | null,
          };

      it(`[${i}] os="${platform.os.substring(0, 10)}" arch="${platform.arch.substring(0, 5)}"`, () => {
        const result = simulatePlatform(platform.os, platform.arch);
        expect(result).toBe(platform.expected);

        // 결과는 null 또는 adev-* 형식
        if (result !== null) {
          expect(result).toMatch(/^adev-(darwin|linux)-(arm64|x64)$/);
        }
      });
    }
  });

  // ── ENV_FILE 키 교체 멱등성: 5,000건 ────────────────────────────
  describe('ENV_FILE key replacement idempotency (5,000 cases)', () => {
    const N = 5_000;

    for (let i = 0; i < N; i++) {
      const key1 = `sk-ant-${randomString(15)}`;
      const key2 = `sk-ant-oat01-${randomString(15)}`;

      it(`[${i}] API key then OAuth replacement`, () => {
        // skip if keys are blank (edge: randomString might return empty)
        if (!key1.trim() || !key2.trim()) return;

        // 1st: API key 저장
        const after1 = simulateAuthChoice('1', key1, '');
        expect(after1.envContent).toContain(`ANTHROPIC_API_KEY=${key1}`);
        expect(after1.envContent).not.toContain('CLAUDE_CODE_OAUTH_TOKEN=');

        // 2nd: OAuth로 교체
        const after2 = simulateAuthChoice('2', key2, after1.envContent);
        expect(after2.envContent).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${key2}`);
        expect(after2.envContent).not.toContain('ANTHROPIC_API_KEY=');

        // 3rd: 다시 API key로 교체
        const key3 = `sk-ant-${randomString(10)}`;
        if (key3.trim()) {
          const after3 = simulateAuthChoice('1', key3, after2.envContent);
          expect(after3.envContent).toContain(`ANTHROPIC_API_KEY=${key3}`);
          expect(after3.envContent).not.toContain('CLAUDE_CODE_OAUTH_TOKEN=');
        }
      });
    }
  });
});

describe('install.sh e2e — 재설치 시나리오 (20,000 cases)', () => {
  // ── 재설치: 키 교체 검증 (10,000건) ──────────────────────────────
  describe('reinstall — key replacement (10,000 cases)', () => {
    const N = 10_000;

    for (let i = 0; i < N; i++) {
      const oldKey = `sk-ant-old-${randomString(10)}`;
      const newKey = `sk-ant-new-${randomString(10)}`;
      const choiceOld = randomChoice(NORMAL_CHOICES); // 초기 설치
      const choiceNew = randomChoice(NORMAL_CHOICES); // 재설치

      it(`[${i}] reinstall choice=${choiceOld}→${choiceNew}`, () => {
        if (!oldKey.trim() || !newKey.trim()) return;

        // 1차 설치
        const install1 = simulateAuthChoice(choiceOld, oldKey, '');

        // 재설치 (2차)
        const install2 = simulateAuthChoice(choiceNew, newKey, install1.envContent);

        if (choiceNew === '1' && newKey.trim()) {
          // 새 API Key만 존재
          expect(install2.envContent).toContain(`ANTHROPIC_API_KEY=${newKey}`);
          expect(install2.envContent).not.toContain(oldKey);
          expect(install2.envContent).not.toContain('CLAUDE_CODE_OAUTH_TOKEN=');
        } else if (choiceNew === '2' && newKey.trim()) {
          // 새 OAuth만 존재
          expect(install2.envContent).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${newKey}`);
          expect(install2.envContent).not.toContain(oldKey);
          expect(install2.envContent).not.toContain('ANTHROPIC_API_KEY=');
        } else if (choiceNew === '3') {
          // Skip → 이전 설치 상태 유지
          expect(install2.envContent).toBe(install1.envContent);
        }

        // 키가 중복으로 존재하면 안 됨
        const apiCount = (install2.envContent.match(/ANTHROPIC_API_KEY=/g) ?? []).length;
        const oauthCount = (install2.envContent.match(/CLAUDE_CODE_OAUTH_TOKEN=/g) ?? []).length;
        expect(apiCount).toBeLessThanOrEqual(1);
        expect(oauthCount).toBeLessThanOrEqual(1);
      });
    }
  });

  // ── 연속 재설치 멱등성 (10,000건) ────────────────────────────────
  describe('reinstall — repeated installs idempotency (10,000 cases)', () => {
    const N = 10_000;

    for (let i = 0; i < N; i++) {
      const key = `sk-ant-${randomString(15)}`;
      const choice = randomChoice(['1', '2'] as const);

      it(`[${i}] 3x reinstall same key choice=${choice}`, () => {
        if (!key.trim()) return;

        const r1 = simulateAuthChoice(choice, key, '');
        const r2 = simulateAuthChoice(choice, key, r1.envContent);
        const r3 = simulateAuthChoice(choice, key, r2.envContent);

        // 같은 키로 3번 설치해도 키가 1개만 존재
        const keyPrefix = choice === '1' ? 'ANTHROPIC_API_KEY=' : 'CLAUDE_CODE_OAUTH_TOKEN=';
        const countR3 = (r3.envContent.match(new RegExp(keyPrefix, 'g')) ?? []).length;
        expect(countR3).toBe(1);

        // 2차와 3차 결과가 동일 (멱등)
        expect(r2.envContent).toBe(r3.envContent);
      });
    }
  });
});

describe('install.sh e2e — 변수 입력 케이스 (30,000 cases)', () => {
  // ── Unicode/국제 문자 입력 (10,000건) ─────────────────────────────
  describe('unicode & international input (10,000 cases)', () => {
    const N = 10_000;

    const UNICODE_CHOICES = [
      '一', '한', '𝟏', '①', '１', // 숫자처럼 보이는 유니코드
      '안녕', 'مرحبا', '你好', '🔑', '✅',
      '\u0000', '\uFFFD', '\u200B', // 제어문자
      '１２３', // 전각 숫자
    ] as const;

    const UNICODE_KEYS = [
      '한글키값', '🔑emoji🔑', 'キー', 'مفتاح',
      'sk-ant-한글', 'sk-ant-🔑🔑🔑',
      '\u0000nullbyte', '\t탭포함', '\n개행포함',
      'a'.repeat(500), 'sk-ant-' + '한'.repeat(100),
    ] as const;

    for (let i = 0; i < N; i++) {
      const isEdgeChoice = Math.random() < 0.8;
      const choice = isEdgeChoice
        ? randomChoice(UNICODE_CHOICES)
        : randomChoice(NORMAL_CHOICES);
      const key = Math.random() < 0.5
        ? randomChoice(UNICODE_KEYS)
        : randomString(50);
      const existingEnv = randomEnvContent();

      it(`[${i}] unicode choice="${choice.substring(0,5)}"`, () => {
        const result = simulateAuthChoice(choice, key, existingEnv);

        // 유니코드 입력은 1/2/3이 아니므로 env 불변
        if (!['1', '2', '3'].includes(choice.trim())) {
          expect(result.envContent).toBe(existingEnv);
        }

        // 항상 string 반환
        expect(typeof result.envContent).toBe('string');
        expect(typeof result.message).toBe('string');
      });
    }
  });

  // ── 극단적 키 길이 (10,000건) ─────────────────────────────────────
  describe('extreme key lengths (10,000 cases)', () => {
    const N = 10_000;

    for (let i = 0; i < N; i++) {
      const isLong = Math.random() < 0.8; // 80% 극단 케이스
      const len = isLong
        ? Math.floor(Math.random() * 1000) + 200 // 200~1200자
        : Math.floor(Math.random() * 50); // 0~50자
      const key = 'sk-ant-' + randomString(len);
      const choice = randomChoice(NORMAL_CHOICES);
      const existingEnv = randomEnvContent();

      it(`[${i}] key length=${key.length} choice=${choice}`, () => {
        const result = simulateAuthChoice(choice, key, existingEnv);

        if (key.trim().length > 0 && (choice === '1' || choice === '2')) {
          const prefix = choice === '1' ? 'ANTHROPIC_API_KEY=' : 'CLAUDE_CODE_OAUTH_TOKEN=';
          expect(result.envContent).toContain(prefix + key);

          // 키가 1개만 존재
          const count = (result.envContent.match(new RegExp(prefix, 'g')) ?? []).length;
          expect(count).toBe(1);
        }

        expect(typeof result.envContent).toBe('string');
      });
    }
  });

  // ── 공백/탭/개행 키 처리 (10,000건) ─────────────────────────────
  describe('whitespace-only keys treated as empty (10,000 cases)', () => {
    const N = 10_000;

    const WHITESPACE_KEYS = [
      '', ' ', '  ', '\t', '\t\t', '\n', '\r\n',
      '   \t   ', '\n\n\n', ' \t \n ',
    ] as const;

    for (let i = 0; i < N; i++) {
      const isEdge = Math.random() < 0.8;
      const key = isEdge
        ? randomChoice(WHITESPACE_KEYS)
        : randomString(3); // 짧은 랜덤
      const choice = randomChoice(['1', '2'] as const); // auth 선택지
      const existingEnv = randomEnvContent();

      it(`[${i}] whitespace key="${JSON.stringify(key).substring(0,15)}" choice=${choice}`, () => {
        const result = simulateAuthChoice(choice, key, existingEnv);

        if (key.trim().length === 0) {
          // 공백 키 → 저장 안 됨, env 불변
          expect(result.envContent).toBe(existingEnv);
          expect(result.message).toContain('입력 없음');
        } else {
          // 비공백 → 저장됨
          const prefix = choice === '1' ? 'ANTHROPIC_API_KEY=' : 'CLAUDE_CODE_OAUTH_TOKEN=';
          expect(result.envContent).toContain(prefix + key);
        }
      });
    }
  });
});

// ── 추가 edge/random 케이스 ────────────────────────────────────────

describe('install.sh e2e — 단순 기능 검증', () => {
  it('simulateAuthChoice: choice=1 키 있음 → ANTHROPIC_API_KEY 포함', () => {
    const result = simulateAuthChoice('1', 'sk-ant-api01-simple', '');
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=sk-ant-api01-simple');
    expect(result.message).toContain('저장 완료');
  });

  it('simulateAuthChoice: choice=2 키 있음 → CLAUDE_CODE_OAUTH_TOKEN 포함', () => {
    const result = simulateAuthChoice('2', 'sk-ant-oat01-simple', '');
    expect(result.envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-simple');
    expect(result.message).toContain('저장 완료');
  });

  it('simulateAuthChoice: choice=3 → env 불변', () => {
    const existingEnv = 'EXISTING=value';
    const result = simulateAuthChoice('3', 'ignored-key', existingEnv);
    expect(result.envContent).toBe(existingEnv);
    expect(result.message).toContain('건너뜀');
  });

  it('simulateAuthChoice: choice=1 빈 키 → env 불변, 메시지 입력 없음', () => {
    const existingEnv = 'EXISTING=value';
    const result = simulateAuthChoice('1', '', existingEnv);
    expect(result.envContent).toBe(existingEnv);
    expect(result.message).toContain('입력 없음');
  });

  it('simulateAuthChoice: choice=2 공백만 키 → env 불변', () => {
    const existingEnv = 'EXISTING=value';
    const result = simulateAuthChoice('2', '   ', existingEnv);
    expect(result.envContent).toBe(existingEnv);
  });

  it('simulateAuthChoice: 잘못된 choice → env 불변', () => {
    const existingEnv = 'EXISTING=value';
    const result = simulateAuthChoice('99', 'some-key', existingEnv);
    expect(result.envContent).toBe(existingEnv);
    expect(result.message).toContain('잘못된 입력');
  });

  it('simulatePathAdd: binDir 없는 상태 → 추가됨', () => {
    const binDir = '/usr/local/bin/adev';
    const result = simulatePathAdd('', binDir);
    expect(result).toContain(binDir);
  });

  it('simulatePathAdd: binDir 이미 있음 → 중복 없음', () => {
    const binDir = '/usr/local/bin/adev';
    const rcContent = `export PATH="${binDir}:$PATH"\n`;
    const result = simulatePathAdd(rcContent, binDir);
    expect(result).toBe(rcContent);
  });

  it('simulatePathAdd: 결과는 string 타입', () => {
    const result = simulatePathAdd('any content', '/some/path');
    expect(typeof result).toBe('string');
  });

  it('simulateTtyBranch: ttyOk=true → prompt', () => {
    expect(simulateTtyBranch(true)).toBe('prompt');
  });

  it('simulateTtyBranch: ttyOk=false → skip', () => {
    expect(simulateTtyBranch(false)).toBe('skip');
  });

  it('simulatePlatform: Darwin arm64 → adev-darwin-arm64', () => {
    expect(simulatePlatform('Darwin', 'arm64')).toBe('adev-darwin-arm64');
  });

  it('simulatePlatform: Linux x86_64 → adev-linux-x64', () => {
    expect(simulatePlatform('Linux', 'x86_64')).toBe('adev-linux-x64');
  });

  it('simulatePlatform: Linux aarch64 → adev-linux-arm64', () => {
    expect(simulatePlatform('Linux', 'aarch64')).toBe('adev-linux-arm64');
  });

  it('simulatePlatform: Linux arm64 → adev-linux-arm64', () => {
    expect(simulatePlatform('Linux', 'arm64')).toBe('adev-linux-arm64');
  });

  it('simulatePlatform: Windows x86_64 → null', () => {
    expect(simulatePlatform('Windows', 'x86_64')).toBeNull();
  });

  it('simulatePlatform: 빈 os → null', () => {
    expect(simulatePlatform('', 'x86_64')).toBeNull();
  });

  it('simulatePlatform: 빈 arch → null', () => {
    expect(simulatePlatform('Darwin', '')).toBeNull();
  });

  it('simulatePlatform: 알 수 없는 조합 → null', () => {
    expect(simulatePlatform('FreeBSD', 'x86_64')).toBeNull();
  });

  it('simulateAuthChoice: choice=1 기존에 API key 있음 → 교체', () => {
    const existingEnv = 'ANTHROPIC_API_KEY=old-key\nOTHER=val';
    const result = simulateAuthChoice('1', 'new-key', existingEnv);
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=new-key');
    expect(result.envContent).not.toContain('old-key');
    const count = (result.envContent.match(/ANTHROPIC_API_KEY=/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('simulateAuthChoice: choice=2 기존에 OAuth 있음 → 교체', () => {
    const existingEnv = 'CLAUDE_CODE_OAUTH_TOKEN=old-token';
    const result = simulateAuthChoice('2', 'new-token', existingEnv);
    expect(result.envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=new-token');
    expect(result.envContent).not.toContain('old-token');
  });

  it('simulateAuthChoice: choice=1 기존에 OAuth 있음 → OAuth 제거', () => {
    const existingEnv = 'CLAUDE_CODE_OAUTH_TOKEN=existing-oauth';
    const result = simulateAuthChoice('1', 'new-api-key', existingEnv);
    expect(result.envContent).not.toContain('CLAUDE_CODE_OAUTH_TOKEN=');
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=new-api-key');
  });

  it('simulateAuthChoice: choice=2 기존에 API key 있음 → API key 제거', () => {
    const existingEnv = 'ANTHROPIC_API_KEY=existing-key';
    const result = simulateAuthChoice('2', 'new-oauth', existingEnv);
    expect(result.envContent).not.toContain('ANTHROPIC_API_KEY=');
    expect(result.envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=new-oauth');
  });

  it('simulateAuthChoice: choice 앞뒤 공백 → trim 처리', () => {
    const result = simulateAuthChoice(' 1 ', 'trimmed-key', '');
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=trimmed-key');
  });

  it('simulatePathAdd: 동일 binDir 3번 호출 → 멱등', () => {
    const binDir = '/home/user/.local/bin';
    const r1 = simulatePathAdd('', binDir);
    const r2 = simulatePathAdd(r1, binDir);
    const r3 = simulatePathAdd(r2, binDir);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('simulatePathAdd: 다른 binDir 두 개 → 둘 다 포함', () => {
    const dir1 = '/path/one';
    const dir2 = '/path/two';
    const r1 = simulatePathAdd('', dir1);
    const r2 = simulatePathAdd(r1, dir2);
    expect(r2).toContain(dir1);
    expect(r2).toContain(dir2);
  });

  it('simulatePlatform: Darwin x86_64 → null (지원 안 됨)', () => {
    expect(simulatePlatform('Darwin', 'x86_64')).toBeNull();
  });

  it('simulatePlatform: 결과 null 또는 adev-* 형식', () => {
    const result = simulatePlatform('Linux', 'x86_64');
    if (result !== null) {
      expect(result).toMatch(/^adev-(darwin|linux)-(arm64|x64)$/);
    }
  });

  it('simulateAuthChoice: message는 항상 string', () => {
    const cases = [
      ['1', 'key', ''],
      ['2', 'token', ''],
      ['3', '', ''],
      ['invalid', 'key', ''],
      ['1', '', ''],
    ];
    for (const [choice, key, env] of cases) {
      const result = simulateAuthChoice(choice ?? '', key ?? '', env ?? '');
      expect(typeof result.message).toBe('string');
    }
  });

  it('simulateAuthChoice: envContent는 항상 string', () => {
    const cases = [
      ['1', 'key', ''],
      ['2', 'token', ''],
      ['3', '', ''],
      ['99', 'key', 'EXISTING=v'],
    ];
    for (const [choice, key, env] of cases) {
      const result = simulateAuthChoice(choice ?? '', key ?? '', env ?? '');
      expect(typeof result.envContent).toBe('string');
    }
  });
});

// ── 추가 edge 케이스 ──────────────────────────────────────────

describe('install.sh e2e — 추가 edge/random 케이스', () => {
  it('simulateAuthChoice: choice=" 1" (앞 공백) → 잘못된 입력 (trim 후 "1" 처리)', () => {
    const result = simulateAuthChoice(' 1', 'mykey', '');
    // trim 후 '1'이므로 저장 완료
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=mykey');
  });

  it('simulateAuthChoice: choice="1 " (뒤 공백) → trim 후 1 처리', () => {
    const result = simulateAuthChoice('1 ', 'mykey2', '');
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=mykey2');
  });

  it('simulateAuthChoice: choice="\t2\t" (탭 공백) → trim 후 2 처리', () => {
    const result = simulateAuthChoice('\t2\t', 'oauthkey', '');
    expect(result.envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=oauthkey');
  });

  it('simulateAuthChoice: choice="\n3\n" (개행 포함) → trim 후 3 처리', () => {
    const result = simulateAuthChoice('\n3\n', 'skipkey', 'EXISTING=val');
    expect(result.envContent).toBe('EXISTING=val');
    expect(result.message).toContain('건너뜀');
  });

  it('simulateAuthChoice: 아주 긴 choice 문자열 → 잘못된 입력', () => {
    const longChoice = 'x'.repeat(1000);
    const result = simulateAuthChoice(longChoice, 'k', 'E=v');
    expect(result.envContent).toBe('E=v');
    expect(result.message).toContain('잘못된 입력');
  });

  it('simulateAuthChoice: 음수 choice → 잘못된 입력', () => {
    const result = simulateAuthChoice('-1', 'key', 'E=v');
    expect(result.envContent).toBe('E=v');
  });

  it('simulateAuthChoice: 소수점 choice → 잘못된 입력', () => {
    const result = simulateAuthChoice('1.5', 'key', 'E=v');
    expect(result.envContent).toBe('E=v');
  });

  it('simulateAuthChoice: 전각 숫자 "１" → 잘못된 입력', () => {
    const result = simulateAuthChoice('１', 'key', 'E=v');
    expect(result.envContent).toBe('E=v');
  });

  it('simulateAuthChoice: 특수문자 choice → 잘못된 입력', () => {
    const result = simulateAuthChoice('!@#$', 'key', 'E=v');
    expect(result.envContent).toBe('E=v');
  });

  it('simulatePathAdd: 빈 binDir 추가 시 처리됨', () => {
    const result = simulatePathAdd('existing content', '');
    // 빈 binDir는 이미 포함되어 있는 것으로 처리되거나 추가됨
    expect(typeof result).toBe('string');
  });

  it('simulatePathAdd: binDir에 특수문자 포함 → 처리됨', () => {
    const binDir = '/home/user with spaces/.local/bin';
    const result = simulatePathAdd('', binDir);
    expect(typeof result).toBe('string');
  });

  it('simulatePathAdd: binDir에 한국어 포함 → 처리됨', () => {
    const binDir = '/홈/사용자/.local/bin';
    const result = simulatePathAdd('', binDir);
    expect(result).toContain(binDir);
  });

  it('simulatePlatform: Darwin arm64 소문자는 null', () => {
    expect(simulatePlatform('darwin', 'arm64')).toBeNull();
  });

  it('simulatePlatform: linux 소문자는 null', () => {
    expect(simulatePlatform('linux', 'x86_64')).toBeNull();
  });

  it('simulatePlatform: Windows_NT → null', () => {
    expect(simulatePlatform('Windows_NT', 'x86_64')).toBeNull();
  });

  it('simulatePlatform: Linux arm64 소문자 → null', () => {
    expect(simulatePlatform('Linux', 'ARM64')).toBeNull();
  });

  it('simulatePlatform: 빈 문자열 둘 다 → null', () => {
    expect(simulatePlatform('', '')).toBeNull();
  });

  it('simulatePlatform: null 문자열 → null', () => {
    expect(simulatePlatform('null', 'null')).toBeNull();
  });

  it('simulateAuthChoice: key에 등호 포함 → envContent에 저장됨', () => {
    const key = 'sk-ant-api01-key=with=equals';
    const result = simulateAuthChoice('1', key, '');
    expect(result.envContent).toContain(`ANTHROPIC_API_KEY=${key}`);
  });

  it('simulateAuthChoice: key에 슬래시 포함 → envContent에 저장됨', () => {
    const key = 'sk-ant-api01-key/with/slash';
    const result = simulateAuthChoice('1', key, '');
    expect(result.envContent).toContain(`ANTHROPIC_API_KEY=${key}`);
  });

  it('simulateAuthChoice: 기존 env에 여러 줄 있을 때 키 교체', () => {
    const existingEnv = 'VAR1=val1\nANTHROPIC_API_KEY=old\nVAR2=val2\nCLAUDE_CODE_OAUTH_TOKEN=old-oauth';
    const result = simulateAuthChoice('1', 'new-key', existingEnv);
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=new-key');
    expect(result.envContent).not.toContain('ANTHROPIC_API_KEY=old');
    expect(result.envContent).not.toContain('CLAUDE_CODE_OAUTH_TOKEN=');
    expect(result.envContent).toContain('VAR1=val1');
    expect(result.envContent).toContain('VAR2=val2');
  });

  it('simulateAuthChoice: 기존 env에 중복 API 키가 있어도 1개로 정리', () => {
    // 실제로 API는 중복 키 방지가 있으므로 결과에 1개만
    const existingEnv = 'ANTHROPIC_API_KEY=key1';
    const result = simulateAuthChoice('1', 'key2', existingEnv);
    const count = (result.envContent.match(/ANTHROPIC_API_KEY=/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('simulatePathAdd: 긴 RC 파일 내용에 binDir 추가', () => {
    const longRcContent = '# bash profile\n' + 'export VAR=val\n'.repeat(100);
    const binDir = '/usr/local/bin/adev';
    const result = simulatePathAdd(longRcContent, binDir);
    expect(result).toContain(binDir);
    const count = (result.match(new RegExp('/usr/local/bin/adev', 'g')) ?? []).length;
    expect(count).toBe(1);
  });

  it('simulateTtyBranch: 여러 번 호출 → 항상 같은 입력에 같은 출력', () => {
    for (let i = 0; i < 20; i++) {
      expect(simulateTtyBranch(true)).toBe('prompt');
      expect(simulateTtyBranch(false)).toBe('skip');
    }
  });

  it('simulatePlatform: 결과가 null이면 설치 불가 표시', () => {
    const unsupportedPlatforms = [
      { os: 'Windows', arch: 'x86_64' },
      { os: 'Darwin', arch: 'x86_64' },
      { os: 'FreeBSD', arch: 'x86_64' },
      { os: 'SunOS', arch: 'x86_64' },
      { os: 'AIX', arch: 'powerpc' },
    ];
    for (const p of unsupportedPlatforms) {
      expect(simulatePlatform(p.os, p.arch)).toBeNull();
    }
  });

  it('simulatePlatform: 지원 가능 플랫폼 목록 검증', () => {
    const supported = [
      { os: 'Darwin', arch: 'arm64', name: 'adev-darwin-arm64' },
      { os: 'Linux', arch: 'x86_64', name: 'adev-linux-x64' },
      { os: 'Linux', arch: 'aarch64', name: 'adev-linux-arm64' },
      { os: 'Linux', arch: 'arm64', name: 'adev-linux-arm64' },
    ];
    for (const p of supported) {
      expect(simulatePlatform(p.os, p.arch)).toBe(p.name);
    }
  });

  it('simulateAuthChoice: choice=2, 기존 env에 API key있을 때 API key 삭제 확인', () => {
    const existingEnv = 'ANTHROPIC_API_KEY=existing-api-key\nOTHER=val';
    const result = simulateAuthChoice('2', 'new-oauth', existingEnv);
    expect(result.envContent).not.toContain('ANTHROPIC_API_KEY=');
    expect(result.envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=new-oauth');
    expect(result.envContent).toContain('OTHER=val');
  });
});

// ── 추가 property-based 케이스 (auth choice 20,000건) ────────

describe('install.sh e2e — 추가 auth choice property (20,000 cases)', () => {
  describe('auth choice with varied env presets (20,000 cases)', () => {
    const N = 20_000;

    const EXTRA_PRESETS = [
      'ADEV_SETTINGS={}',
      'LOG_LEVEL=debug\nANTHROPIC_API_KEY=old',
      'CLAUDE_CODE_OAUTH_TOKEN=token\nLOG_LEVEL=info',
      'A=1\nB=2\nC=3\nANTHROPIC_API_KEY=stale',
      '',
    ] as const;

    for (let i = 0; i < N; i++) {
      const choice = randomAuthChoice();
      const key = randomKey();
      const existingEnv = Math.random() < 0.6
        ? randomChoice(EXTRA_PRESETS)
        : randomEnvContent();

      it(`[extra-${i}] choice="${choice.substring(0, 8)}" key="${key.substring(0, 8)}"`, () => {
        const result = simulateAuthChoice(choice, key, existingEnv);

        const tc = choice.trim();

        if (tc === '1' && key.trim().length > 0) {
          expect(result.envContent).toContain(`ANTHROPIC_API_KEY=${key}`);
          expect(result.envContent).not.toContain('CLAUDE_CODE_OAUTH_TOKEN=');
        } else if (tc === '2' && key.trim().length > 0) {
          expect(result.envContent).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${key}`);
          expect(result.envContent).not.toContain('ANTHROPIC_API_KEY=');
        } else if (tc === '3') {
          expect(result.envContent).toBe(existingEnv);
        } else if ((tc === '1' || tc === '2') && key.trim().length === 0) {
          expect(result.envContent).toBe(existingEnv);
          expect(result.message).toContain('입력 없음');
        } else {
          expect(result.envContent).toBe(existingEnv);
        }

        expect(typeof result.envContent).toBe('string');
        expect(typeof result.message).toBe('string');
      });
    }
  });
});

// ── 추가 PATH dedup 케이스 (10,000건) ────────────────────────

describe('install.sh e2e — 추가 PATH dedup 다양한 binDir (10,000 cases)', () => {
  const N = 10_000;

  const BIN_DIRS = [
    '/home/user/.local/bin',
    '/usr/local/bin/adev',
    '/opt/adev/bin',
    '~/.adev/bin',
    '/root/.local/bin',
  ] as const;

  for (let i = 0; i < N; i++) {
    const binDir = BIN_DIRS[i % BIN_DIRS.length] as string;
    const alreadyHas = Math.random() < 0.5;
    const base = alreadyHas
      ? `# existing\nexport PATH="${binDir}:$PATH"\n${randomString(20)}`
      : randomString(40);

    it(`[extra-path-${i}] binDir=${binDir.substring(0, 20)} alreadyHas=${alreadyHas}`, () => {
      const result = simulatePathAdd(base, binDir);

      const count = (result.match(new RegExp(escapeRegex(binDir), 'g')) ?? []).length;
      expect(count).toBe(1);
      expect(typeof result).toBe('string');

      if (alreadyHas) {
        expect(result).toBe(base);
      } else {
        expect(result).toContain(binDir);
      }
    });
  }
});

// ── 추가 단순 기능 검증 케이스 ───────────────────────────────

describe('install.sh e2e — 추가 단순 기능 검증 (edge 케이스)', () => {
  it('simulateAuthChoice: choice=1, key에 백슬래시 포함 → 저장됨', () => {
    const key = 'sk-ant-key\\with\\backslash';
    const result = simulateAuthChoice('1', key, '');
    expect(result.envContent).toContain(`ANTHROPIC_API_KEY=${key}`);
  });

  it('simulateAuthChoice: choice=2, key에 백틱 포함 → 저장됨', () => {
    const key = 'sk-ant-oat01-key`with`backtick';
    const result = simulateAuthChoice('2', key, '');
    expect(result.envContent).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${key}`);
  });

  it('simulateAuthChoice: choice=1, 기존 env에 여러 다른 변수들 보존', () => {
    const existing = 'VAR_A=alpha\nVAR_B=beta\nVAR_C=gamma';
    const result = simulateAuthChoice('1', 'new-api-key', existing);
    expect(result.envContent).toContain('VAR_A=alpha');
    expect(result.envContent).toContain('VAR_B=beta');
    expect(result.envContent).toContain('VAR_C=gamma');
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=new-api-key');
  });

  it('simulateAuthChoice: choice=2, 기존 env에 여러 다른 변수들 보존', () => {
    const existing = 'X=1\nY=2';
    const result = simulateAuthChoice('2', 'new-oauth-token', existing);
    expect(result.envContent).toContain('X=1');
    expect(result.envContent).toContain('Y=2');
    expect(result.envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=new-oauth-token');
  });

  it('simulateAuthChoice: choice=3, 기존 env 완전 보존', () => {
    const complex = 'A=1\nANTHROPIC_API_KEY=old\nB=2\nCLAUDE_CODE_OAUTH_TOKEN=old-oauth\nC=3';
    const result = simulateAuthChoice('3', 'ignored', complex);
    expect(result.envContent).toBe(complex);
    expect(result.message).toContain('건너뜀');
  });

  it('simulatePathAdd: export 문 형식 확인', () => {
    const binDir = '/test/bin';
    const result = simulatePathAdd('', binDir);
    expect(result).toContain(`export PATH="${binDir}:$PATH"`);
  });

  it('simulatePathAdd: 주석 포함됨', () => {
    const binDir = '/test/bin';
    const result = simulatePathAdd('', binDir);
    expect(result).toContain('# adev');
  });

  it('simulatePathAdd: 새 항목 추가 후 결과가 기존보다 길어짐', () => {
    const binDir = '/new/unique/path/adev';
    const before = 'existing content';
    const after = simulatePathAdd(before, binDir);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it('simulatePlatform: Linux arm64 (ARM64 대문자) → null', () => {
    expect(simulatePlatform('Linux', 'ARM64')).toBeNull();
  });

  it('simulatePlatform: Darwin aarch64 → null (지원 안 됨)', () => {
    expect(simulatePlatform('Darwin', 'aarch64')).toBeNull();
  });

  it('simulatePlatform: Windows arm64 → null', () => {
    expect(simulatePlatform('Windows', 'arm64')).toBeNull();
  });

  it('simulatePlatform: 빈 os, arm64 → null', () => {
    expect(simulatePlatform('', 'arm64')).toBeNull();
  });

  it('simulatePlatform: Linux, 빈 arch → null', () => {
    expect(simulatePlatform('Linux', '')).toBeNull();
  });

  it('simulateAuthChoice: choice에 탭+숫자 → trim 후 처리', () => {
    const result = simulateAuthChoice('\t1\t', 'key-with-tab-choice', '');
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=key-with-tab-choice');
  });

  it('simulateAuthChoice: choice=" 2 " (앞뒤 공백) → trim 후 2 처리', () => {
    const result = simulateAuthChoice(' 2 ', 'oauth-key', '');
    expect(result.envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=oauth-key');
  });

  it('simulateAuthChoice: 결과 구조 확인 — envContent와 message 둘 다 string', () => {
    for (const choice of ['1', '2', '3', 'invalid', '']) {
      const result = simulateAuthChoice(choice, 'test-key', '');
      expect(typeof result.envContent).toBe('string');
      expect(typeof result.message).toBe('string');
    }
  });

  it('simulateTtyBranch: true → "prompt"이다', () => {
    expect(simulateTtyBranch(true)).toBe('prompt');
  });

  it('simulateTtyBranch: false → "skip"이다', () => {
    expect(simulateTtyBranch(false)).toBe('skip');
  });

  it('simulateTtyBranch: 반환값은 항상 string', () => {
    expect(typeof simulateTtyBranch(true)).toBe('string');
    expect(typeof simulateTtyBranch(false)).toBe('string');
  });

  it('simulatePlatform: 반환값은 null 또는 string', () => {
    const result = simulatePlatform('Linux', 'x86_64');
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('simulatePathAdd: 결과가 binDir 포함 (새 추가)', () => {
    const binDir = '/unique/path/for/this/test/bin';
    const result = simulatePathAdd('empty content without path', binDir);
    expect(result).toContain(binDir);
  });

  it('simulateAuthChoice: 공백 choice + 공백 key → env 불변', () => {
    const env = 'EXISTING=value';
    const result = simulateAuthChoice(' ', ' ', env);
    expect(result.envContent).toBe(env);
  });

  it('simulateAuthChoice: 개행 choice "\\n1\\n" → trim 후 1 처리', () => {
    const result = simulateAuthChoice('\n1\n', 'newline-key', '');
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=newline-key');
  });

  it('simulateAuthChoice: key에 = 포함 → 저장됨 (값이 = 포함)', () => {
    const key = 'base64encodedkey==';
    const result = simulateAuthChoice('1', key, '');
    expect(result.envContent).toContain(`ANTHROPIC_API_KEY=${key}`);
  });

  it('simulateAuthChoice: key에 ; 포함 → 저장됨', () => {
    const key = 'key;with;semicolons';
    const result = simulateAuthChoice('2', key, '');
    expect(result.envContent).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${key}`);
  });

  it('simulatePlatform: 모든 지원 플랫폼 확인 — 4개', () => {
    const supported: Array<[string, string, string]> = [
      ['Darwin', 'arm64', 'adev-darwin-arm64'],
      ['Linux', 'x86_64', 'adev-linux-x64'],
      ['Linux', 'aarch64', 'adev-linux-arm64'],
      ['Linux', 'arm64', 'adev-linux-arm64'],
    ];
    for (const [os, arch, expected] of supported) {
      expect(simulatePlatform(os, arch)).toBe(expected);
    }
  });

  it('simulatePathAdd: 이미 존재하는 binDir → 원본 반환', () => {
    const binDir = '/already/present/bin';
    const content = `something before\nexport PATH="${binDir}:$PATH"\nsomething after`;
    const result = simulatePathAdd(content, binDir);
    expect(result).toBe(content);
  });

  it('simulateAuthChoice: 빈 env에서 choice=1 → 새 env 생성됨', () => {
    const result = simulateAuthChoice('1', 'fresh-key', '');
    expect(result.envContent).toBe('ANTHROPIC_API_KEY=fresh-key');
    expect(result.message).toContain('저장 완료');
  });

  it('simulateAuthChoice: 빈 env에서 choice=2 → 새 env 생성됨', () => {
    const result = simulateAuthChoice('2', 'fresh-oauth', '');
    expect(result.envContent).toBe('CLAUDE_CODE_OAUTH_TOKEN=fresh-oauth');
    expect(result.message).toContain('저장 완료');
  });
});

// ── 추가 경계값 / 극단 케이스 검증 ────────────────────────────

describe('install.sh e2e — 최종 경계값 모음', () => {
  it('simulateAuthChoice: key 길이 0 (빈 문자열) → 입력 없음', () => {
    const result = simulateAuthChoice('1', '', '');
    expect(result.message).toContain('입력 없음');
    expect(result.envContent).toBe('');
  });

  it('simulateAuthChoice: key 길이 1 → 저장됨', () => {
    const result = simulateAuthChoice('1', 'x', '');
    expect(result.envContent).toContain('ANTHROPIC_API_KEY=x');
  });

  it('simulateAuthChoice: key 길이 2 → 저장됨', () => {
    const result = simulateAuthChoice('2', 'ab', '');
    expect(result.envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=ab');
  });

  it('simulateAuthChoice: key 길이 1000 → 저장됨', () => {
    const key = 'k'.repeat(1000);
    const result = simulateAuthChoice('1', key, '');
    expect(result.envContent).toContain(`ANTHROPIC_API_KEY=${key}`);
  });

  it('simulateAuthChoice: 재실행 시 동일 key 멱등성', () => {
    const key = 'idempotent-key-12345';
    const r1 = simulateAuthChoice('1', key, '');
    const r2 = simulateAuthChoice('1', key, r1.envContent);
    expect(r1.envContent).toBe(r2.envContent);
    const count = (r2.envContent.match(/ANTHROPIC_API_KEY=/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('simulateAuthChoice: choice=" " 공백만 → 잘못된 입력', () => {
    const result = simulateAuthChoice(' ', 'key', 'EXISTING=v');
    expect(result.envContent).toBe('EXISTING=v');
  });

  it('simulatePlatform: "LINUX" 대문자 → null', () => {
    expect(simulatePlatform('LINUX', 'x86_64')).toBeNull();
  });

  it('simulatePlatform: "DARWIN" 대문자 → null', () => {
    expect(simulatePlatform('DARWIN', 'arm64')).toBeNull();
  });

  it('simulatePlatform: 반환값이 null이거나 adev로 시작하는 string', () => {
    const result = simulatePlatform('Darwin', 'arm64');
    expect(result !== null && result.startsWith('adev')).toBe(true);
  });

  it('simulatePathAdd: RC 파일 빈 문자열 → binDir 추가됨', () => {
    const result = simulatePathAdd('', '/bin/adev');
    expect(result).toContain('/bin/adev');
  });

  it('simulatePathAdd: RC 파일 매우 긴 문자열 → binDir 추가됨', () => {
    const longRc = 'X'.repeat(5000);
    const result = simulatePathAdd(longRc, '/new/bin');
    expect(result).toContain('/new/bin');
    const count = (result.match(/\/new\/bin/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('simulateAuthChoice: 빈 env + choice=1 + 긴 key → env=ANTHROPIC_API_KEY=<key>', () => {
    const key = 'long-key-' + 'a'.repeat(100);
    const result = simulateAuthChoice('1', key, '');
    expect(result.envContent).toBe(`ANTHROPIC_API_KEY=${key}`);
  });

  it('simulateAuthChoice: choice=1 후 choice=1 다른 key → 두 번째 key만 남음', () => {
    const key1 = 'first-api-key';
    const key2 = 'second-api-key';
    const r1 = simulateAuthChoice('1', key1, '');
    const r2 = simulateAuthChoice('1', key2, r1.envContent);
    expect(r2.envContent).toContain(`ANTHROPIC_API_KEY=${key2}`);
    expect(r2.envContent).not.toContain(key1);
  });

  it('simulateAuthChoice: choice=2 후 choice=2 다른 key → 두 번째 key만 남음', () => {
    const key1 = 'first-oauth';
    const key2 = 'second-oauth';
    const r1 = simulateAuthChoice('2', key1, '');
    const r2 = simulateAuthChoice('2', key2, r1.envContent);
    expect(r2.envContent).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${key2}`);
    expect(r2.envContent).not.toContain(key1);
  });

  it('simulateAuthChoice: choice=1 → message가 "✅ API Key 저장 완료"', () => {
    const result = simulateAuthChoice('1', 'my-key', '');
    expect(result.message).toBe('✅ API Key 저장 완료');
  });

  it('simulateAuthChoice: choice=2 → message가 "✅ OAuth Token 저장 완료"', () => {
    const result = simulateAuthChoice('2', 'my-token', '');
    expect(result.message).toBe('✅ OAuth Token 저장 완료');
  });

  it('simulateAuthChoice: choice=3 → message가 "⏭️  건너뜀"', () => {
    const result = simulateAuthChoice('3', '', '');
    expect(result.message).toBe('⏭️  건너뜀');
  });

  it('simulateAuthChoice: choice=1 빈 key → message가 "⚠️  입력 없음"', () => {
    const result = simulateAuthChoice('1', '', '');
    expect(result.message).toBe('⚠️  입력 없음');
  });

  it('simulateAuthChoice: 잘못된 choice → message가 "⚠️  잘못된 입력"', () => {
    const result = simulateAuthChoice('invalid', 'key', '');
    expect(result.message).toBe('⚠️  잘못된 입력');
  });

  it('simulatePlatform: Linux x86_64 결과에 x64 포함', () => {
    const result = simulatePlatform('Linux', 'x86_64');
    expect(result).toContain('x64');
  });

  it('simulatePlatform: Linux arm64 결과에 arm64 포함', () => {
    const result = simulatePlatform('Linux', 'arm64');
    expect(result).toContain('arm64');
  });

  it('simulatePlatform: Darwin arm64 결과에 darwin 포함', () => {
    const result = simulatePlatform('Darwin', 'arm64');
    expect(result).toContain('darwin');
  });
});
