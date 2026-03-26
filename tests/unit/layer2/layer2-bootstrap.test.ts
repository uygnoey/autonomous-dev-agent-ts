/**
 * layer2-bootstrap 단위 테스트 / layer2-bootstrap unit tests
 *
 * @description
 * KR: Layer2Bootstrap의 의존성 주입, createTeamLeader 초기화 검증.
 * EN: Tests for Layer2Bootstrap dependency injection and createTeamLeader initialization.
 */

import { describe, expect, it } from 'bun:test';
import { Layer2Bootstrap } from 'layer2/layer2-bootstrap.js';
import type { Layer2BootstrapOptions } from 'layer2/layer2-bootstrap.js';
import type { AuthProvider } from 'auth/types.js';
import type { Logger } from 'core/logger.js';

// ── 모의 의존성 / Mock Dependencies ──────────────────────────

function createMockLogger(): Logger {
  const noop = (): void => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => createMockLogger(),
  } as unknown as Logger;
}

function createMockAuthProvider(): AuthProvider {
  return {
    getApiKey: () => 'test-api-key',
    getAuthMode: () => 'api-key' as const,
    getHeaders: () => ({ 'x-api-key': 'test-api-key' }),
  } as unknown as AuthProvider;
}

function createMinimalOptions(overrides?: Partial<Layer2BootstrapOptions>): Layer2BootstrapOptions {
  return {
    authProvider: createMockAuthProvider(),
    logger: createMockLogger(),
    projectCwd: '/tmp/test-project',
    ...overrides,
  };
}

// ── 생성자 검증 / Constructor ────────────────────────────────

describe('Layer2Bootstrap 생성자', () => {
  it('필수 옵션만으로 인스턴스를 생성한다', () => {
    const options = createMinimalOptions();

    const bootstrap = new Layer2Bootstrap(options);

    expect(bootstrap).toBeInstanceOf(Layer2Bootstrap);
  });

  it('선택 옵션 없이도 인스턴스를 생성한다', () => {
    const options = createMinimalOptions({
      testing: undefined,
      userCheckpoint: undefined,
      userInputProvider: undefined,
      verificationConfig: undefined,
      ragSearcher: undefined,
    });

    const bootstrap = new Layer2Bootstrap(options);

    expect(bootstrap).toBeInstanceOf(Layer2Bootstrap);
  });

  it('testing 설정을 주입할 수 있다', () => {
    const options = createMinimalOptions({
      testing: {
        unitCount: 5000,
        moduleCount: 5000,
        e2eCount: 50000,
        integrationE2eCount: 500000,
        parallelWorkers: 4,
        e2eTimeoutSeconds: 120,
        cleanEnvType: 'local',
        totalMemoryMb: 2048,
      },
    });

    const bootstrap = new Layer2Bootstrap(options);

    expect(bootstrap).toBeInstanceOf(Layer2Bootstrap);
  });

  it('verificationConfig를 주입할 수 있다', () => {
    const options = createMinimalOptions({
      verificationConfig: {
        layer1Model: 'sonnet',
        adevModel: 'sonnet',
        opusEscalationOnFailure: false,
      },
    });

    const bootstrap = new Layer2Bootstrap(options);

    expect(bootstrap).toBeInstanceOf(Layer2Bootstrap);
  });
});

// ── createTeamLeader 검증 / createTeamLeader ─────────────────

describe('Layer2Bootstrap.createTeamLeader', () => {
  it('createTeamLeader가 async 함수이다', () => {
    const bootstrap = new Layer2Bootstrap(createMinimalOptions());

    const result = bootstrap.createTeamLeader();

    expect(result).toBeInstanceOf(Promise);
  });

  // WHY: createTeamLeader는 실제 SDK 의존성(Anthropic API, LanceDB 등)이 필요하므로
  //      완전한 통합 테스트는 module 레벨에서 수행하고,
  //      여기서는 인스턴스 생성 및 메서드 존재 여부만 검증한다

  it('createTeamLeader 메서드가 존재한다', () => {
    const bootstrap = new Layer2Bootstrap(createMinimalOptions());

    expect(typeof bootstrap.createTeamLeader).toBe('function');
  });
});

// ── 엣지 케이스 / Edge Cases ─────────────────────────────────

describe('Layer2Bootstrap 엣지 케이스', () => {
  it('parallelWorkers가 "auto"일 때 정상 생성된다', () => {
    const options = createMinimalOptions({
      testing: {
        unitCount: 10000,
        moduleCount: 10000,
        e2eCount: 100000,
        integrationE2eCount: 1000000,
        parallelWorkers: 'auto',
        e2eTimeoutSeconds: 300,
        cleanEnvType: 'local',
        totalMemoryMb: 4096,
      },
    });

    const bootstrap = new Layer2Bootstrap(options);

    expect(bootstrap).toBeInstanceOf(Layer2Bootstrap);
  });

  it('parallelWorkers가 숫자일 때 정상 생성된다', () => {
    const options = createMinimalOptions({
      testing: {
        unitCount: 10000,
        moduleCount: 10000,
        e2eCount: 100000,
        integrationE2eCount: 1000000,
        parallelWorkers: 8,
        e2eTimeoutSeconds: 300,
        cleanEnvType: 'local',
        totalMemoryMb: 4096,
      },
    });

    const bootstrap = new Layer2Bootstrap(options);

    expect(bootstrap).toBeInstanceOf(Layer2Bootstrap);
  });

  it('projectCwd가 빈 문자열이어도 생성은 성공한다', () => {
    const options = createMinimalOptions({ projectCwd: '' });

    const bootstrap = new Layer2Bootstrap(options);

    expect(bootstrap).toBeInstanceOf(Layer2Bootstrap);
  });
});
