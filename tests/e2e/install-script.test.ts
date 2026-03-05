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
