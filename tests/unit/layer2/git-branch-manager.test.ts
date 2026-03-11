/**
 * GitBranchManager 단위 테스트 / GitBranchManager unit tests
 *
 * @description
 * KR: ProcessExecutor를 mock으로 교체하여 모든 브랜치 생성/병합 시나리오를 검증한다.
 *     edge case 비중 80%+ (비정상 입력, 충돌, 실패 경로 등).
 * EN: Validates all branch setup/merge scenarios with a mocked ProcessExecutor.
 *     Edge case coverage 80%+ (invalid input, conflicts, failure paths, etc.).
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { AdevError } from 'core/errors.js';
import { ConsoleLogger } from 'core/logger.js';
import type { ProcessResult } from 'core/process-executor.js';
import type { Result } from 'core/types.js';
import { GitBranchManager } from 'layer2/git-branch-manager.js';
import type { AgentEvent } from 'layer2/types.js';

// ── Mock ProcessExecutor ─────────────────────────────────────────

type ExecCall = { command: string; args: readonly string[] };

interface MockBehavior {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  /** throw 에러 시뮬레이션 (ProcessExecutor 자체 실패) */
  throwError?: AdevError;
}

/** 순서대로 응답을 반환하는 간단한 mock */
function makeMockExecutor(responses: MockBehavior[]) {
  let callIndex = 0;
  const calls: ExecCall[] = [];

  const execute = async (
    command: string,
    args: readonly string[] = [],
  ): Promise<Result<ProcessResult>> => {
    calls.push({ command, args });
    const behavior = responses[callIndex++] ?? { exitCode: 0, stdout: '', stderr: '' };

    if (behavior.throwError) {
      return { ok: false, error: behavior.throwError };
    }

    return {
      ok: true,
      value: {
        exitCode: behavior.exitCode ?? 0,
        stdout: behavior.stdout ?? '',
        stderr: behavior.stderr ?? '',
        durationMs: 1,
      },
    };
  };

  return { execute, calls };
}

// ── 테스트 픽스처 ───────────────────────────────────────────────

const logger = new ConsoleLogger('error');

function collectEvents(gen: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  return (async () => {
    const events: AgentEvent[] = [];
    for await (const e of gen) events.push(e);
    return events;
  })();
}

// ── setupBranch 테스트 ──────────────────────────────────────────

describe('GitBranchManager.setupBranch', () => {
  // ── 정상 케이스 (20%) ─────────────────────────────────────────
  describe('새 브랜치 생성 성공', () => {
    it('checkout -b 성공 → message event 1개', async () => {
      const mock = makeMockExecutor([{ exitCode: 0, stdout: "Switched to a new branch 'feat/x'" }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('message');
      expect(events[0]?.content).toContain('feat/x');
    });

    it('checkout -b 성공 → git 명령 1회만 호출', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.setupBranch('feat/success'));

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0]?.args).toEqual(['checkout', '-b', 'feat/success']);
    });
  });

  // ── edge case (80%) ───────────────────────────────────────────
  describe('브랜치 이미 존재 → checkout 재시도 성공', () => {
    it('checkout -b 실패 → checkout 성공 → message event', async () => {
      const mock = makeMockExecutor([
        { exitCode: 128, stderr: "fatal: A branch named 'feat/x' already exists." },
        { exitCode: 0, stdout: "Switched to branch 'feat/x'" },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('message');
      expect(events[0]?.content).toContain('feat/x');
    });

    it('checkout -b 실패 → checkout 성공 → git 명령 2회 호출', async () => {
      const mock = makeMockExecutor([
        { exitCode: 128, stderr: 'already exists' },
        { exitCode: 0 },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.setupBranch('feat/x'));

      expect(mock.calls).toHaveLength(2);
      expect(mock.calls[0]?.args).toEqual(['checkout', '-b', 'feat/x']);
      expect(mock.calls[1]?.args).toEqual(['checkout', 'feat/x']);
    });

    it('checkout -b 실패 → checkout 성공 → event agentName은 architect', async () => {
      const mock = makeMockExecutor([{ exitCode: 1, stderr: 'err' }, { exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(events[0]?.agentName).toBe('architect');
    });
  });

  describe('브랜치 이미 존재 → checkout도 실패 → error event', () => {
    it('두 번 모두 실패 → error event 1개', async () => {
      const mock = makeMockExecutor([
        { exitCode: 128, stderr: 'already exists' },
        { exitCode: 1, stderr: 'error: pathspec not found' },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('error');
    });

    it('두 번 모두 실패 → error 내용에 브랜치명 포함', async () => {
      const mock = makeMockExecutor([
        { exitCode: 1, stderr: 'fail1' },
        { exitCode: 1, stderr: 'pathspec not found' },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/broken'));

      expect(events[0]?.content).toContain('feat/broken');
    });

    it('두 번 모두 실패 → error 내용에 오류 메시지 포함', async () => {
      const mock = makeMockExecutor([
        { exitCode: 1, stderr: 'create-fail' },
        { exitCode: 1, stderr: 'checkout-fail-msg' },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(events[0]?.content).toContain('checkout-fail-msg');
    });

    it('두 번 모두 실패 → git 명령 2회 호출', async () => {
      const mock = makeMockExecutor([
        { exitCode: 1, stderr: 'f' },
        { exitCode: 1, stderr: 'f' },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.setupBranch('feat/x'));

      expect(mock.calls).toHaveLength(2);
    });

    it('ProcessExecutor 자체 실패(ok: false) → error event', async () => {
      const mock = makeMockExecutor([
        { throwError: new AdevError('process_timeout', '타임아웃') },
        { throwError: new AdevError('process_timeout', '타임아웃') },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(events[0]?.type).toBe('error');
    });

    it('빈 브랜치 이름 → error event (git가 실패)', async () => {
      const mock = makeMockExecutor([
        { exitCode: 129, stderr: 'bad branch name' },
        { exitCode: 129, stderr: 'bad branch name' },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch(''));

      expect(events[0]?.type).toBe('error');
    });

    it('특수문자 브랜치명 → git 그대로 전달', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.setupBranch('feat/some-feature-123'));

      expect(mock.calls[0]?.args[2]).toBe('feat/some-feature-123');
    });
  });

  describe('event 구조 검증', () => {
    it('성공 event에 timestamp가 Date 객체', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(events[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('error event에 timestamp가 Date 객체', async () => {
      const mock = makeMockExecutor([{ exitCode: 1, stderr: 'e' }, { exitCode: 1, stderr: 'e' }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(events[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('event content가 문자열', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.setupBranch('feat/x'));

      expect(typeof events[0]?.content).toBe('string');
    });
  });
});

// ── mergeBranch 테스트 ──────────────────────────────────────────

describe('GitBranchManager.mergeBranch', () => {
  // ── 정상 케이스 (20%) ─────────────────────────────────────────
  describe('병합 성공', () => {
    it('checkout + merge 성공 → message event 1개', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 }, // checkout main
        { exitCode: 0 }, // merge --no-ff
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('message');
    });

    it('성공 → message content에 브랜치명과 베이스 브랜치 포함', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }, { exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x', 'develop'));

      expect(events[0]?.content).toContain('feat/x');
      expect(events[0]?.content).toContain('develop');
    });

    it('기본 베이스 브랜치는 main', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }, { exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.mergeBranch('feat/x'));

      expect(mock.calls[0]?.args).toEqual(['checkout', 'main']);
    });

    it('merge 커밋 메시지에 브랜치명 포함', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }, { exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.mergeBranch('feat/my-feature'));

      const mergeArgs = mock.calls[1]?.args;
      expect(mergeArgs).toContain('feat/my-feature');
      expect(mergeArgs).toContain('--no-ff');
    });
  });

  // ── edge case (80%) ───────────────────────────────────────────
  describe('베이스 브랜치 checkout 실패', () => {
    it('checkout 실패 → error event 1개, merge 미실행', async () => {
      const mock = makeMockExecutor([{ exitCode: 1, stderr: 'error: pathspec main not found' }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('error');
      expect(mock.calls).toHaveLength(1);
    });

    it('checkout 실패 → error content에 베이스 브랜치명 포함', async () => {
      const mock = makeMockExecutor([{ exitCode: 1, stderr: 'not found' }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x', 'develop'));

      expect(events[0]?.content).toContain('develop');
    });

    it('checkout ProcessExecutor 실패(ok: false) → error event', async () => {
      const mock = makeMockExecutor([
        { throwError: new AdevError('process_timeout', '타임아웃') },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events[0]?.type).toBe('error');
    });
  });

  describe('merge 충돌 → merge --abort + error event', () => {
    it('merge 충돌 → merge --abort 호출됨', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 },    // checkout main
        { exitCode: 1, stderr: 'CONFLICT (content)' }, // merge 충돌
        { exitCode: 0, stdout: 'src/foo.ts\nsrc/bar.ts\n' }, // diff --name-only
        { exitCode: 0 },    // merge --abort
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.mergeBranch('feat/x'));

      const abortCall = mock.calls.find(
        (c) => c.args[0] === 'merge' && c.args.includes('--abort'),
      );
      expect(abortCall).toBeDefined();
    });

    it('merge 충돌 → error event 1개', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 },
        { exitCode: 1, stderr: 'CONFLICT' },
        { exitCode: 0, stdout: 'src/a.ts\n' },
        { exitCode: 0 },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('error');
    });

    it('merge 충돌 → error content에 충돌 파일 포함', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 },
        { exitCode: 1, stderr: 'CONFLICT' },
        { exitCode: 0, stdout: 'src/a.ts\nsrc/b.ts\n' },
        { exitCode: 0 },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events[0]?.content).toContain('src/a.ts');
      expect(events[0]?.content).toContain('src/b.ts');
    });

    it('merge 충돌 → error content에 브랜치명 포함', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 },
        { exitCode: 1, stderr: 'CONFLICT' },
        { exitCode: 0, stdout: '' },
        { exitCode: 0 },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/conflict-branch'));

      expect(events[0]?.content).toContain('feat/conflict-branch');
    });

    it('merge 충돌, diff 실패 → 빈 파일 목록으로 error event', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 },
        { exitCode: 1, stderr: 'CONFLICT' },
        { exitCode: 1, stderr: 'diff failed' }, // diff 실패
        { exitCode: 0 },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events[0]?.type).toBe('error');
      expect(events[0]?.content).toContain('파일 목록 없음');
    });

    it('merge 충돌, diff 빈 stdout → 파일 목록 없음', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 },
        { exitCode: 1, stderr: 'CONFLICT' },
        { exitCode: 0, stdout: '   \n\n  ' }, // 공백만
        { exitCode: 0 },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events[0]?.content).toContain('파일 목록 없음');
    });

    it('merge --abort 실패해도 error event는 yield', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 },
        { exitCode: 1, stderr: 'CONFLICT' },
        { exitCode: 0, stdout: 'f.ts\n' },
        { exitCode: 1, stderr: 'abort failed' }, // abort 실패
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('error');
    });

    it('충돌 파일 10개 모두 포함', async () => {
      const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`).join('\n');
      const mock = makeMockExecutor([
        { exitCode: 0 },
        { exitCode: 1, stderr: 'CONFLICT' },
        { exitCode: 0, stdout: `${files}\n` },
        { exitCode: 0 },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events[0]?.content).toContain('src/file0.ts');
      expect(events[0]?.content).toContain('src/file9.ts');
    });
  });

  describe('git 명령 시퀀스 검증', () => {
    it('성공 시 checkout → merge 순서', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }, { exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.mergeBranch('feat/x', 'main'));

      expect(mock.calls[0]?.args).toEqual(['checkout', 'main']);
      expect(mock.calls[1]?.args).toEqual(['merge', '--no-ff', 'feat/x', '-m', 'merge: feat/x']);
    });

    it('충돌 시 checkout → merge → diff → abort 순서', async () => {
      const mock = makeMockExecutor([
        { exitCode: 0 },
        { exitCode: 1, stderr: 'CONFLICT' },
        { exitCode: 0, stdout: '' },
        { exitCode: 0 },
      ]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      await collectEvents(manager.mergeBranch('feat/x'));

      expect(mock.calls).toHaveLength(4);
      expect(mock.calls[0]?.args[0]).toBe('checkout');
      expect(mock.calls[1]?.args[0]).toBe('merge');
      expect(mock.calls[2]?.args).toEqual(['diff', '--name-only', '--diff-filter=U']);
      expect(mock.calls[3]?.args).toEqual(['merge', '--abort']);
    });
  });

  describe('event 구조 검증', () => {
    it('성공 event agentName은 architect', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }, { exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events[0]?.agentName).toBe('architect');
    });

    it('error event agentName은 architect', async () => {
      const mock = makeMockExecutor([{ exitCode: 1, stderr: 'err' }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events[0]?.agentName).toBe('architect');
    });

    it('event timestamp는 Date 객체', async () => {
      const mock = makeMockExecutor([{ exitCode: 0 }, { exitCode: 0 }]);
      const manager = new GitBranchManager({ processExecutor: mock as never, logger });
      const events = await collectEvents(manager.mergeBranch('feat/x'));

      expect(events[0]?.timestamp).toBeInstanceOf(Date);
    });
  });
});

// ── 생성자 / cwd 테스트 ──────────────────────────────────────────

describe('GitBranchManager 생성자', () => {
  it('인스턴스 생성 성공', () => {
    const mock = makeMockExecutor([]);
    expect(
      () => new GitBranchManager({ processExecutor: mock as never, logger }),
    ).not.toThrow();
  });

  it('cwd 미지정 시 process.cwd() 사용 (오류 없이 생성)', () => {
    const mock = makeMockExecutor([]);
    const manager = new GitBranchManager({ processExecutor: mock as never, logger });
    expect(manager).toBeInstanceOf(GitBranchManager);
  });

  it('cwd 지정 시 git 명령에 cwd 전달', async () => {
    const capturedOpts: unknown[] = [];
    const mockExec = {
      execute: async (cmd: string, args: readonly string[], opts: unknown) => {
        capturedOpts.push(opts);
        return { ok: true as const, value: { exitCode: 0, stdout: '', stderr: '', durationMs: 1 } };
      },
    };
    const manager = new GitBranchManager({
      processExecutor: mockExec as never,
      logger,
      cwd: '/custom/path',
    });
    await collectEvents(manager.setupBranch('feat/x'));

    expect((capturedOpts[0] as { cwd: string }).cwd).toBe('/custom/path');
  });

  it('두 인스턴스는 서로 독립', () => {
    const mock = makeMockExecutor([]);
    const m1 = new GitBranchManager({ processExecutor: mock as never, logger });
    const m2 = new GitBranchManager({ processExecutor: mock as never, logger });
    expect(m1).not.toBe(m2);
  });
});
