/**
 * PhaseRecorder 단위 테스트 / Unit tests for PhaseRecorder
 *
 * @description
 * KR: Phase 전환 시 DesignDecision/FailureRecord 자동 기록 검증.
 *     엣지 케이스 비중 80% 이상 준수.
 * EN: Validates auto-recording of DesignDecision/FailureRecord on phase transitions.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { ConsoleLogger } from 'core/logger.js';
import type { DesignDecision, FailureRecord, Phase, Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { IPhaseEngine, PhaseParticipants } from 'layer2/phase-engine.js';
import { PhaseRecorder } from 'layer2/phase-recorder.js';
import type { PhaseTransition } from 'layer2/types.js';

const logger = new ConsoleLogger('error');

// ── 테스트 픽스처 / Test fixtures ────────────────────────────────

/** PhaseEngine 스텁 (EventEmitter 기반) / PhaseEngine stub with EventEmitter */
class StubPhaseEngine extends EventEmitter implements IPhaseEngine {
  private current: Phase = 'DESIGN';

  get currentPhase(): Phase {
    return this.current;
  }

  transition(to: Phase, reason: string, triggeredBy: string): Result<PhaseTransition> {
    const transition: PhaseTransition = {
      from: this.current,
      to,
      reason,
      triggeredBy: triggeredBy as 'adev',
      timestamp: new Date(),
    };
    this.current = to;
    this.emit('phase:changed', transition);
    return ok(transition);
  }

  canTransition(_to: Phase): boolean {
    return true;
  }

  getParticipants(_phase: Phase): PhaseParticipants {
    return { lead: [], active: [], inactive: [] };
  }

  reset(): void {
    this.current = 'DESIGN';
  }

  getHistory(): readonly PhaseTransition[] {
    return [];
  }
}

/** Repository 스텁 / Repository stub */
function createMockRepo<T>(): {
  repo: { insert: (r: T) => Promise<Result<void>>; search: () => Promise<Result<T[]>>; getById: () => Promise<Result<T | null>>; update: () => Promise<Result<void>>; delete: () => Promise<Result<void>> };
  records: T[];
  insertCalls: number;
} {
  const state = { records: [] as T[], insertCalls: 0 };
  return {
    repo: {
      insert: async (record: T) => {
        state.records.push(record);
        state.insertCalls++;
        return ok(undefined);
      },
      search: async () => ok([] as T[]),
      getById: async () => ok(null as T | null),
      update: async () => ok(undefined),
      delete: async () => ok(undefined),
    },
    get records() { return state.records; },
    get insertCalls() { return state.insertCalls; },
  };
}

// ── attach / detach ──────────────────────────────────────────────

describe('PhaseRecorder attach/detach', () => {
  it('attach 후 detach해도 에러 없음', () => {
    const engine = new StubPhaseEngine();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      projectId: 'p1',
      featureId: 'f1',
    });
    expect(() => {
      recorder.attach();
      recorder.detach();
    }).not.toThrow();
  });

  it('이중 attach는 무시된다', () => {
    const engine = new StubPhaseEngine();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();
    recorder.attach(); // 두 번째 호출은 무시
    recorder.detach();
  });

  it('attach 없이 detach해도 에러 없음', () => {
    const engine = new StubPhaseEngine();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      projectId: 'p1',
      featureId: 'f1',
    });
    expect(() => recorder.detach()).not.toThrow();
  });

  it('이중 detach는 무시된다', () => {
    const engine = new StubPhaseEngine();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();
    recorder.detach();
    recorder.detach();
  });
});

// ── DESIGN→CODE 설계 결정 기록 ──────────────────────────────────

describe('PhaseRecorder DESIGN→CODE 설계 결정 기록', () => {
  it('DESIGN→CODE 전환 시 DesignDecision을 기록한다', async () => {
    const engine = new StubPhaseEngine();
    const mock = createMockRepo<DesignDecision>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      designDecisionRepo: mock.repo,
      projectId: 'proj-1',
      featureId: 'feat-1',
    });
    recorder.attach();

    engine.transition('CODE', 'QA gate passed', 'qa');

    // WHY: 이벤트 핸들러는 async void — microtask 완료 대기
    await new Promise((r) => setTimeout(r, 50));

    expect(mock.insertCalls).toBe(1);
    expect(mock.records.length).toBe(1);
    const record = mock.records[0]!;
    expect(record.projectId).toBe('proj-1');
    expect(record.featureId).toBe('feat-1');
    expect(record.decision).toContain('DESIGN phase completed');
    expect(record.rationale).toBe('QA gate passed');

    recorder.detach();
  });

  it('designDecisionRepo가 없으면 기록하지 않는다', async () => {
    const engine = new StubPhaseEngine();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    expect(() => engine.transition('CODE', 'test', 'qa')).not.toThrow();

    await new Promise((r) => setTimeout(r, 50));
    recorder.detach();
  });

  it('기록된 DesignDecision의 embedding은 384차원이다', async () => {
    const engine = new StubPhaseEngine();
    const mock = createMockRepo<DesignDecision>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      designDecisionRepo: mock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'test', 'qa');
    await new Promise((r) => setTimeout(r, 50));

    expect(mock.records[0]!.embedding.length).toBe(384);
    recorder.detach();
  });

  it('기록된 DesignDecision의 id는 UUID 형식이다', async () => {
    const engine = new StubPhaseEngine();
    const mock = createMockRepo<DesignDecision>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      designDecisionRepo: mock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'test', 'qa');
    await new Promise((r) => setTimeout(r, 50));

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(mock.records[0]!.id).toMatch(uuidRegex);
    recorder.detach();
  });

  it('기록된 DesignDecision의 decidedBy에 triggeredBy가 포함된다', async () => {
    const engine = new StubPhaseEngine();
    const mock = createMockRepo<DesignDecision>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      designDecisionRepo: mock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'test', 'architect');
    await new Promise((r) => setTimeout(r, 50));

    expect(mock.records[0]!.decidedBy).toContain('architect');
    recorder.detach();
  });
});

// ── VERIFY→* 롤백 실패 기록 ─────────────────────────────────────

describe('PhaseRecorder VERIFY→* 롤백 실패 기록', () => {
  it('VERIFY→DESIGN 롤백 시 FailureRecord를 기록한다', async () => {
    const engine = new StubPhaseEngine();
    const failMock = createMockRepo<FailureRecord>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      failureRepo: failMock.repo,
      projectId: 'proj-2',
      featureId: 'feat-2',
    });
    recorder.attach();

    // DESIGN→CODE→TEST→VERIFY→DESIGN 순서로 전환
    engine.transition('CODE', 'qa passed', 'qa');
    engine.transition('TEST', 'code done', 'coder');
    engine.transition('VERIFY', 'test done', 'tester');

    await new Promise((r) => setTimeout(r, 50));
    expect(failMock.insertCalls).toBe(0); // 아직 롤백 없음

    engine.transition('DESIGN', 'verification failed', 'qc');
    await new Promise((r) => setTimeout(r, 50));

    expect(failMock.insertCalls).toBe(1);
    const record = failMock.records[0]!;
    expect(record.projectId).toBe('proj-2');
    expect(record.featureId).toBe('feat-2');
    expect(record.phase).toBe('VERIFY');
    expect(record.failureType).toBe('rollback_to_DESIGN');
    expect(record.rootCause).toBe('verification failed');

    recorder.detach();
  });

  it('VERIFY→CODE 롤백 시 failureType이 rollback_to_CODE이다', async () => {
    const engine = new StubPhaseEngine();
    const failMock = createMockRepo<FailureRecord>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      failureRepo: failMock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'ok', 'qa');
    engine.transition('TEST', 'ok', 'coder');
    engine.transition('VERIFY', 'ok', 'tester');
    engine.transition('CODE', 'code issue', 'reviewer');
    await new Promise((r) => setTimeout(r, 50));

    expect(failMock.records[0]!.failureType).toBe('rollback_to_CODE');
    recorder.detach();
  });

  it('failureRepo가 없으면 롤백 시 기록하지 않는다', async () => {
    const engine = new StubPhaseEngine();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'ok', 'qa');
    engine.transition('TEST', 'ok', 'coder');
    engine.transition('VERIFY', 'ok', 'tester');
    expect(() => engine.transition('DESIGN', 'fail', 'qc')).not.toThrow();

    await new Promise((r) => setTimeout(r, 50));
    recorder.detach();
  });

  it('기록된 FailureRecord의 embedding은 384차원이다', async () => {
    const engine = new StubPhaseEngine();
    const failMock = createMockRepo<FailureRecord>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      failureRepo: failMock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'ok', 'qa');
    engine.transition('TEST', 'ok', 'coder');
    engine.transition('VERIFY', 'ok', 'tester');
    engine.transition('DESIGN', 'fail', 'qc');
    await new Promise((r) => setTimeout(r, 50));

    expect(failMock.records[0]!.embedding.length).toBe(384);
    recorder.detach();
  });

  it('기록된 FailureRecord의 resolution은 빈 문자열이다', async () => {
    const engine = new StubPhaseEngine();
    const failMock = createMockRepo<FailureRecord>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      failureRepo: failMock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'ok', 'qa');
    engine.transition('TEST', 'ok', 'coder');
    engine.transition('VERIFY', 'ok', 'tester');
    engine.transition('DESIGN', 'fail', 'qc');
    await new Promise((r) => setTimeout(r, 50));

    // WHY: 실패 기록 시점에는 resolution이 아직 없으므로 빈 문자열
    expect(failMock.records[0]!.resolution).toBe('');
    recorder.detach();
  });
});

// ── 순방향 전환 시 기록하지 않는 케이스 ──────────────────────────

describe('PhaseRecorder 순방향 전환 — 불필요한 기록 방지', () => {
  it('CODE→TEST 전환 시 DesignDecision을 기록하지 않는다', async () => {
    const engine = new StubPhaseEngine();
    const ddMock = createMockRepo<DesignDecision>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      designDecisionRepo: ddMock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'qa passed', 'qa');
    await new Promise((r) => setTimeout(r, 50));
    const countAfterDesignToCode = ddMock.insertCalls;

    engine.transition('TEST', 'code done', 'coder');
    await new Promise((r) => setTimeout(r, 50));

    // WHY: CODE→TEST는 DesignDecision 기록 대상 아님
    expect(ddMock.insertCalls).toBe(countAfterDesignToCode);
    recorder.detach();
  });

  it('TEST→VERIFY 전환 시 FailureRecord를 기록하지 않는다', async () => {
    const engine = new StubPhaseEngine();
    const failMock = createMockRepo<FailureRecord>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      failureRepo: failMock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();

    engine.transition('CODE', 'ok', 'qa');
    engine.transition('TEST', 'ok', 'coder');
    engine.transition('VERIFY', 'ok', 'tester');
    await new Promise((r) => setTimeout(r, 50));

    // WHY: 순방향 전환은 실패가 아니므로 기록하지 않는다
    expect(failMock.insertCalls).toBe(0);
    recorder.detach();
  });

  it('detach 후에는 Phase 전환 시 기록하지 않는다', async () => {
    const engine = new StubPhaseEngine();
    const ddMock = createMockRepo<DesignDecision>();
    const recorder = new PhaseRecorder({
      phaseEngine: engine,
      logger,
      designDecisionRepo: ddMock.repo,
      projectId: 'p1',
      featureId: 'f1',
    });
    recorder.attach();
    recorder.detach();

    engine.transition('CODE', 'qa passed', 'qa');
    await new Promise((r) => setTimeout(r, 50));

    expect(ddMock.insertCalls).toBe(0);
  });
});
