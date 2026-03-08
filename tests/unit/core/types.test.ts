import { describe, expect, it } from 'bun:test';
import { AdevError } from 'core/errors.js';
import { err, ok } from 'core/types.js';
import type {
  AgentName,
  DesignDecision,
  FailureRecord,
  FeatureStatus,
  MemoryRecord,
  MemoryType,
  Phase,
  Result,
} from 'core/types.js';

describe('ok()', () => {
  it('ok: true와 value를 포함한다', () => {
    const result = ok(42);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('문자열 값을 감싼다', () => {
    const result = ok('hello');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('hello');
  });

  it('null을 감쌀 수 있다', () => {
    const result = ok(null);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('undefined를 감쌀 수 있다', () => {
    const result = ok(undefined);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeUndefined();
  });

  it('0을 감쌀 수 있다', () => {
    const result = ok(0);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('빈 문자열을 감쌀 수 있다', () => {
    const result = ok('');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('');
  });

  it('false를 감쌀 수 있다', () => {
    const result = ok(false);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });

  it('빈 배열을 감쌀 수 있다', () => {
    const result = ok([]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('복잡한 객체를 감쌀 수 있다', () => {
    const obj = { nested: { deep: [1, 2, 3] } };
    const result = ok(obj);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(obj);
  });

  it('음수를 감쌀 수 있다', () => {
    const result = ok(-1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(-1);
  });

  it('NaN을 감쌀 수 있다', () => {
    const result = ok(Number.NaN);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Number.isNaN(result.value)).toBe(true);
  });

  it('Infinity를 감쌀 수 있다', () => {
    const result = ok(Infinity);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(Infinity);
  });

  it('-Infinity를 감쌀 수 있다', () => {
    const result = ok(-Infinity);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(-Infinity);
  });

  it('빈 객체를 감쌀 수 있다', () => {
    const result = ok({});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({});
  });

  it('Symbol을 감쌀 수 있다', () => {
    const sym = Symbol('test');
    const result = ok(sym);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(sym);
  });

  it('함수를 감쌀 수 있다', () => {
    const fn = () => 42;
    const result = ok(fn);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(fn);
  });

  it('Map을 감쌀 수 있다', () => {
    const map = new Map([['key', 'value']]);
    const result = ok(map);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(map);
  });

  it('Set을 감쌀 수 있다', () => {
    const set = new Set([1, 2, 3]);
    const result = ok(set);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.size).toBe(3);
  });

  it('Date를 감쌀 수 있다', () => {
    const date = new Date();
    const result = ok(date);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(date);
  });

  it('Float32Array를 감쌀 수 있다', () => {
    const arr = new Float32Array([1.0, 2.0, 3.0]);
    const result = ok(arr);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(3);
  });

  it('ok 결과에는 error 프로퍼티가 없다', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // TypeScript 타입 레벨에서 error 없음 확인
      expect('error' in result).toBe(false);
    }
  });

  it('연속 ok 호출 → 독립적인 객체', () => {
    const r1 = ok(1);
    const r2 = ok(2);
    expect(r1).not.toBe(r2);
    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(1);
      expect(r2.value).toBe(2);
    }
  });

  it('ok(undefined) → value가 undefined', () => {
    const result: Result<void> = ok(undefined);
    expect(result.ok).toBe(true);
  });

  it('중첩 ok 가능', () => {
    const inner = ok(42);
    const outer = ok(inner);
    expect(outer.ok).toBe(true);
    if (outer.ok) {
      expect(outer.value.ok).toBe(true);
      if (outer.value.ok) expect(outer.value.value).toBe(42);
    }
  });

  it('배열 값 ok → 참조 동일성', () => {
    const arr = [1, 2, 3];
    const result = ok(arr);
    if (result.ok) expect(result.value).toBe(arr);
  });

  it('boolean true를 감쌀 수 있다', () => {
    const result = ok(true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
  });

  it('Number.MAX_SAFE_INTEGER를 감쌀 수 있다', () => {
    const result = ok(Number.MAX_SAFE_INTEGER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('Number.MIN_SAFE_INTEGER를 감쌀 수 있다', () => {
    const result = ok(Number.MIN_SAFE_INTEGER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(Number.MIN_SAFE_INTEGER);
  });
});

describe('err()', () => {
  it('ok: false와 error를 포함한다', () => {
    const error = new AdevError('test', 'msg');
    const result = err(error);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
      expect(result.error.code).toBe('test');
    }
  });

  it('문자열 에러를 감쌀 수 있다', () => {
    const result = err('string error');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('string error');
  });

  it('숫자 에러 코드를 감쌀 수 있다', () => {
    const result = err(404);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(404);
  });

  it('빈 문자열 에러 → ok=false', () => {
    const result = err('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('');
  });

  it('null 에러 → ok=false', () => {
    const result = err(null as unknown as AdevError);
    expect(result.ok).toBe(false);
  });

  it('AdevError 에러 → message 확인', () => {
    const error = new AdevError('some_code', 'some message');
    const result = err(error);
    if (!result.ok) {
      expect(result.error.message).toBe('some message');
    }
  });

  it('err 결과에는 value 프로퍼티가 없다', () => {
    const result = err(new AdevError('code', 'msg'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect('value' in result).toBe(false);
    }
  });

  it('연속 err 호출 → 독립적인 객체', () => {
    const e1 = err(new AdevError('code1', 'msg1'));
    const e2 = err(new AdevError('code2', 'msg2'));
    expect(e1).not.toBe(e2);
    if (!e1.ok && !e2.ok) {
      expect(e1.error.code).toBe('code1');
      expect(e2.error.code).toBe('code2');
    }
  });

  it('여러 다른 에러 코드 → 각각 ok=false', () => {
    const codes = ['cli_no_command', 'rag_file_not_found', 'mcp_duplicate_server', 'auth_failed'];
    for (const code of codes) {
      const result = err(new AdevError(code, `message for ${code}`));
      expect(result.ok).toBe(false);
    }
  });

  it('ok=false 구별자로 분기 가능', () => {
    const result: Result<number, AdevError> = err(new AdevError('test', 'msg'));
    if (result.ok) {
      // 이 분기 실행되지 않음
      expect(true).toBe(false);
    } else {
      expect(result.error.code).toBe('test');
    }
  });
});

describe('Result discriminated union', () => {
  it('ok일 때 value에 접근 가능하다', () => {
    const result: Result<number> = ok(42);

    if (result.ok) {
      const value: number = result.value;
      expect(value).toBe(42);
    } else {
      // 이 분기는 실행되지 않아야 함
      expect(true).toBe(false);
    }
  });

  it('err일 때 error에 접근 가능하다', () => {
    const error = new AdevError('code', 'msg');
    const result: Result<number> = err(error);

    if (!result.ok) {
      const e: AdevError = result.error;
      expect(e.code).toBe('code');
    } else {
      expect(true).toBe(false);
    }
  });

  it('void Result를 처리할 수 있다', () => {
    const result: Result<void> = ok(undefined);

    expect(result.ok).toBe(true);
  });

  it('배열 Result → ok 배열 접근', () => {
    const result: Result<number[]> = ok([1, 2, 3]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(3);
  });

  it('중첩 객체 Result → ok 객체 접근', () => {
    const result: Result<{ x: number; y: string }> = ok({ x: 1, y: 'hello' });
    if (result.ok) {
      expect(result.value.x).toBe(1);
      expect(result.value.y).toBe('hello');
    }
  });

  it('Promise<Result> 패턴', async () => {
    const asyncOk = async (): Promise<Result<number>> => ok(99);
    const result = await asyncOk();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(99);
  });

  it('Promise<Result> 에러 패턴', async () => {
    const asyncErr = async (): Promise<Result<number>> => err(new AdevError('async_fail', 'failed'));
    const result = await asyncErr();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('async_fail');
  });

  it('조건부 ok/err 분기', () => {
    const decide = (flag: boolean): Result<string> =>
      flag ? ok('yes') : err(new AdevError('no', 'negative'));

    const r1 = decide(true);
    const r2 = decide(false);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });

  it('ok Result는 boolean true이다', () => {
    expect(ok(1).ok).toBe(true);
    expect(ok('').ok).toBe(true);
    expect(ok(null).ok).toBe(true);
    expect(ok(undefined).ok).toBe(true);
  });

  it('err Result는 boolean false이다', () => {
    expect(err(new AdevError('a', 'b')).ok).toBe(false);
    expect(err('string').ok).toBe(false);
    expect(err(0).ok).toBe(false);
  });
});

describe('리터럴 타입 검증', () => {
  it('Phase 값이 유효하다', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];

    expect(phases).toHaveLength(4);
    expect(phases).toContain('DESIGN');
    expect(phases).toContain('CODE');
    expect(phases).toContain('TEST');
    expect(phases).toContain('VERIFY');
  });

  it('AgentName 값이 유효하다', () => {
    const agents: AgentName[] = [
      'architect',
      'qa',
      'coder',
      'tester',
      'qc',
      'reviewer',
      'documenter',
    ];

    expect(agents).toHaveLength(7);
  });

  it('FeatureStatus 값이 유효하다', () => {
    const statuses: FeatureStatus[] = [
      'pending',
      'designing',
      'coding',
      'testing',
      'verifying',
      'complete',
      'failed',
    ];

    expect(statuses).toHaveLength(7);
  });

  it('MemoryType 값이 유효하다', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];

    expect(types).toHaveLength(4);
  });

  it('Phase 모든 값이 문자열이다', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const p of phases) {
      expect(typeof p).toBe('string');
    }
  });

  it('AgentName 모든 값이 문자열이다', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const a of agents) {
      expect(typeof a).toBe('string');
    }
  });

  it('FeatureStatus 모든 값이 문자열이다', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    for (const s of statuses) {
      expect(typeof s).toBe('string');
    }
  });

  it('MemoryType 모든 값이 문자열이다', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    for (const t of types) {
      expect(typeof t).toBe('string');
    }
  });

  it('Phase 중복 없음', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    const unique = new Set(phases);
    expect(unique.size).toBe(phases.length);
  });

  it('AgentName 중복 없음', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    const unique = new Set(agents);
    expect(unique.size).toBe(agents.length);
  });

  it('FeatureStatus 중복 없음', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    const unique = new Set(statuses);
    expect(unique.size).toBe(statuses.length);
  });

  it('MemoryType 중복 없음', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });

  it('Phase DESIGN 포함', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    expect(phases.includes('DESIGN')).toBe(true);
  });

  it('Phase CODE 포함', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    expect(phases.includes('CODE')).toBe(true);
  });

  it('Phase TEST 포함', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    expect(phases.includes('TEST')).toBe(true);
  });

  it('Phase VERIFY 포함', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    expect(phases.includes('VERIFY')).toBe(true);
  });

  it('AgentName architect 포함', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    expect(agents.includes('architect')).toBe(true);
  });

  it('AgentName coder 포함', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    expect(agents.includes('coder')).toBe(true);
  });

  it('AgentName tester 포함', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    expect(agents.includes('tester')).toBe(true);
  });

  it('FeatureStatus complete 포함', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    expect(statuses.includes('complete')).toBe(true);
  });

  it('FeatureStatus failed 포함', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    expect(statuses.includes('failed')).toBe(true);
  });

  it('MemoryType conversation 포함', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    expect(types.includes('conversation')).toBe(true);
  });

  it('MemoryType error 포함', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    expect(types.includes('error')).toBe(true);
  });
});

describe('LanceDB 레코드 인터페이스 구조 검증', () => {
  it('MemoryRecord 구조를 만족하는 객체를 생성할 수 있다', () => {
    const record: MemoryRecord = {
      id: 'mem-001',
      projectId: 'proj-001',
      type: 'conversation',
      content: '유저: REST API 만들고 싶어',
      embedding: new Float32Array([0.1, 0.2, 0.3]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-001',
        agentName: 'architect',
        timestamp: new Date('2026-03-04'),
      },
    };

    expect(record.id).toBe('mem-001');
    expect(record.type).toBe('conversation');
    expect(record.embedding).toBeInstanceOf(Float32Array);
    expect(record.metadata.phase).toBe('DESIGN');
  });

  it('DesignDecision 구조를 만족하는 객체를 생성할 수 있다', () => {
    const decision: DesignDecision = {
      id: 'dd-001',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: 'JWT 인증 채택',
      rationale: '확장성과 무상태 특성',
      alternatives: ['세션 기반', 'OAuth2 only'],
      decidedBy: ['architect', 'reviewer'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };

    expect(decision.alternatives).toHaveLength(2);
    expect(decision.decidedBy).toContain('architect');
  });

  it('FailureRecord 구조를 만족하는 객체를 생성할 수 있다', () => {
    const failure: FailureRecord = {
      id: 'fail-001',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'TEST',
      failureType: 'test_failed',
      rootCause: 'null 체크 누락',
      resolution: 'optional chaining 추가',
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };

    expect(failure.phase).toBe('TEST');
    expect(failure.failureType).toBe('test_failed');
  });

  it('빈 Float32Array embedding을 허용한다', () => {
    const record: MemoryRecord = {
      id: 'mem-empty',
      projectId: 'proj-001',
      type: 'error',
      content: '',
      embedding: new Float32Array(0),
      metadata: {
        phase: 'VERIFY',
        featureId: '',
        agentName: 'qc',
        timestamp: new Date(),
      },
    };

    expect(record.embedding.length).toBe(0);
  });

  it('MemoryRecord type = decision', () => {
    const record: MemoryRecord = {
      id: 'mem-dec',
      projectId: 'proj-001',
      type: 'decision',
      content: 'JWT 채택 결정',
      embedding: new Float32Array(384),
      metadata: { phase: 'DESIGN', featureId: 'feat-1', agentName: 'architect', timestamp: new Date() },
    };
    expect(record.type).toBe('decision');
  });

  it('MemoryRecord type = feedback', () => {
    const record: MemoryRecord = {
      id: 'mem-fb',
      projectId: 'proj-001',
      type: 'feedback',
      content: '코드 리뷰 피드백',
      embedding: new Float32Array(384),
      metadata: { phase: 'CODE', featureId: 'feat-1', agentName: 'reviewer', timestamp: new Date() },
    };
    expect(record.type).toBe('feedback');
  });

  it('MemoryRecord type = error', () => {
    const record: MemoryRecord = {
      id: 'mem-err',
      projectId: 'proj-001',
      type: 'error',
      content: '오류 발생',
      embedding: new Float32Array(384),
      metadata: { phase: 'TEST', featureId: 'feat-1', agentName: 'tester', timestamp: new Date() },
    };
    expect(record.type).toBe('error');
  });

  it('MemoryRecord embedding은 Float32Array이다', () => {
    const record: MemoryRecord = {
      id: 'mem-f32',
      projectId: 'proj-001',
      type: 'conversation',
      content: 'content',
      embedding: new Float32Array(384),
      metadata: { phase: 'DESIGN', featureId: 'feat-1', agentName: 'qa', timestamp: new Date() },
    };
    expect(record.embedding).toBeInstanceOf(Float32Array);
    expect(record.embedding.length).toBe(384);
  });

  it('DesignDecision alternatives 빈 배열 허용', () => {
    const decision: DesignDecision = {
      id: 'dd-002',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: 'JWT만 사용',
      rationale: '단순화',
      alternatives: [],
      decidedBy: ['architect'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(decision.alternatives).toHaveLength(0);
  });

  it('DesignDecision decidedBy 여러 에이전트', () => {
    const decision: DesignDecision = {
      id: 'dd-003',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: '결정',
      rationale: '이유',
      alternatives: [],
      decidedBy: ['architect', 'reviewer', 'qa'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(decision.decidedBy).toHaveLength(3);
    expect(decision.decidedBy).toContain('qa');
  });

  it('FailureRecord phase = CODE', () => {
    const failure: FailureRecord = {
      id: 'fail-002',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'CODE',
      failureType: 'type_error',
      rootCause: '타입 불일치',
      resolution: 'any 제거',
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(failure.phase).toBe('CODE');
  });

  it('FailureRecord phase = DESIGN', () => {
    const failure: FailureRecord = {
      id: 'fail-003',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'DESIGN',
      failureType: 'design_gap',
      rootCause: '미정의 경계',
      resolution: '추가 명세',
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(failure.phase).toBe('DESIGN');
  });

  it('FailureRecord phase = VERIFY', () => {
    const failure: FailureRecord = {
      id: 'fail-004',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'VERIFY',
      failureType: 'verification_failed',
      rootCause: 'e2e 실패',
      resolution: '재배포',
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(failure.phase).toBe('VERIFY');
  });

  it('MemoryRecord metadata.agentName 모든 값 허용', () => {
    const agentNames: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const agentName of agentNames) {
      const record: MemoryRecord = {
        id: `mem-${agentName}`,
        projectId: 'proj-001',
        type: 'conversation',
        content: 'test',
        embedding: new Float32Array(384),
        metadata: { phase: 'CODE', featureId: 'feat-1', agentName, timestamp: new Date() },
      };
      expect(record.metadata.agentName).toBe(agentName);
    }
  });

  it('MemoryRecord metadata.phase 모든 Phase 허용', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const record: MemoryRecord = {
        id: `mem-${phase}`,
        projectId: 'proj-001',
        type: 'conversation',
        content: 'test',
        embedding: new Float32Array(384),
        metadata: { phase, featureId: 'feat-1', agentName: 'coder', timestamp: new Date() },
      };
      expect(record.metadata.phase).toBe(phase);
    }
  });
});
