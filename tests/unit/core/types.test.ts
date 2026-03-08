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

  it('MemoryRecord id가 UUID 형식이어도 허용', () => {
    const record: MemoryRecord = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      projectId: 'proj-001',
      type: 'conversation',
      content: 'uuid id test',
      embedding: new Float32Array(384),
      metadata: { phase: 'CODE', featureId: 'feat-uuid', agentName: 'coder', timestamp: new Date() },
    };
    expect(record.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('MemoryRecord content 한국어 허용', () => {
    const record: MemoryRecord = {
      id: 'mem-kr',
      projectId: 'proj-001',
      type: 'conversation',
      content: '한국어 콘텐츠 테스트입니다',
      embedding: new Float32Array(384),
      metadata: { phase: 'CODE', featureId: 'feat-1', agentName: 'coder', timestamp: new Date() },
    };
    expect(record.content).toContain('한국어');
  });

  it('MemoryRecord content 빈 문자열 허용', () => {
    const record: MemoryRecord = {
      id: 'mem-empty-content',
      projectId: 'proj-001',
      type: 'error',
      content: '',
      embedding: new Float32Array(0),
      metadata: { phase: 'VERIFY', featureId: '', agentName: 'qc', timestamp: new Date() },
    };
    expect(record.content).toBe('');
  });

  it('FailureRecord rootCause 한국어 허용', () => {
    const failure: FailureRecord = {
      id: 'fail-kr-root',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'TEST',
      failureType: 'null_pointer',
      rootCause: '널 포인터 예외 발생',
      resolution: 'null 체크 추가',
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(failure.rootCause).toContain('널 포인터');
  });

  it('DesignDecision decision 특수문자 포함 허용', () => {
    const decision: DesignDecision = {
      id: 'dd-special',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: 'REST API v2 + GraphQL (hybrid)',
      rationale: '두 방식의 장점 결합',
      alternatives: [],
      decidedBy: ['architect'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(decision.decision).toContain('+');
  });

  it('ok(빈 string 배열) → value는 빈 배열', () => {
    const result = ok<string[]>([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('err(AdevError) → error.message는 string', () => {
    const error = new AdevError('test_code', 'test message');
    const result = err(error);
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('ok 결과와 err 결과의 ok 필드는 서로 다름', () => {
    const okResult = ok(1);
    const errResult = err(new AdevError('code', 'msg'));
    expect(okResult.ok).not.toBe(errResult.ok);
  });

  it('MemoryRecord 10개 생성 → 모두 독립적인 embedding', () => {
    const records: MemoryRecord[] = [];
    for (let i = 0; i < 10; i++) {
      records.push({
        id: `mem-${i}`,
        projectId: 'proj-001',
        type: 'conversation',
        content: `content ${i}`,
        embedding: new Float32Array(384),
        metadata: { phase: 'CODE', featureId: `feat-${i}`, agentName: 'coder', timestamp: new Date() },
      });
    }
    for (let i = 0; i < records.length; i++) {
      expect(records[i]?.embedding).toBeInstanceOf(Float32Array);
    }
  });

  it('DesignDecision timestamp는 Date 인스턴스', () => {
    const decision: DesignDecision = {
      id: 'dd-ts',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: '타임스탬프 테스트',
      rationale: '이유',
      alternatives: [],
      decidedBy: ['architect'],
      embedding: new Float32Array(384),
      timestamp: new Date('2026-01-01'),
    };
    expect(decision.timestamp).toBeInstanceOf(Date);
  });
});

// ── ok() 추가 경계값 ──────────────────────────────────────────

describe('ok() 추가 경계값', () => {
  it('ok(BigInt(1)) → value가 BigInt', () => {
    const result = ok(BigInt(1));
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.value).toBe('bigint');
  });

  it('ok(new Error("test")) → value가 Error 인스턴스', () => {
    const error = new Error('test');
    const result = ok(error);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeInstanceOf(Error);
  });

  it('ok([]) 두 번 → 두 결과 독립', () => {
    const r1 = ok([1, 2]);
    const r2 = ok([3, 4]);
    if (r1.ok && r2.ok) {
      expect(r1.value[0]).toBe(1);
      expect(r2.value[0]).toBe(3);
    }
  });

  it('ok(0) ok 프로퍼티는 true', () => {
    expect(ok(0).ok).toBe(true);
  });

  it('ok(false) ok 프로퍼티는 true', () => {
    expect(ok(false).ok).toBe(true);
  });

  it('ok(null) ok 프로퍼티는 true', () => {
    expect(ok(null).ok).toBe(true);
  });

  it('ok(undefined) ok 프로퍼티는 true', () => {
    expect(ok(undefined).ok).toBe(true);
  });

  it('ok({}) 결과는 객체', () => {
    const r = ok({});
    expect(typeof r).toBe('object');
  });

  it('ok(Map) value가 Map', () => {
    const m = new Map<string, number>([['a', 1]]);
    const r = ok(m);
    if (r.ok) expect(r.value.get('a')).toBe(1);
  });

  it('ok(Set) value가 Set', () => {
    const s = new Set([1, 2, 3, 4, 5]);
    const r = ok(s);
    if (r.ok) expect(r.value.size).toBe(5);
  });

  it('10번 ok(i) → ok 모두 true', () => {
    for (let i = 0; i < 10; i++) {
      expect(ok(i).ok).toBe(true);
    }
  });

  it('ok 결과는 readonly ok property', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
  });

  it('ok(Number.POSITIVE_INFINITY) value 확인', () => {
    const r = ok(Number.POSITIVE_INFINITY);
    if (r.ok) expect(r.value).toBe(Number.POSITIVE_INFINITY);
  });

  it('ok(Number.NEGATIVE_INFINITY) value 확인', () => {
    const r = ok(Number.NEGATIVE_INFINITY);
    if (r.ok) expect(r.value).toBe(Number.NEGATIVE_INFINITY);
  });

  it('ok(Number.NaN) value는 NaN', () => {
    const r = ok(Number.NaN);
    if (r.ok) expect(Number.isNaN(r.value)).toBe(true);
  });

  it('ok(Number.EPSILON) value 확인', () => {
    const r = ok(Number.EPSILON);
    if (r.ok) expect(r.value).toBe(Number.EPSILON);
  });

  it('ok(빈 Map) value size는 0', () => {
    const r = ok(new Map());
    if (r.ok) expect(r.value.size).toBe(0);
  });

  it('ok(빈 Set) value size는 0', () => {
    const r = ok(new Set());
    if (r.ok) expect(r.value.size).toBe(0);
  });

  it('ok(Uint8Array) value는 Uint8Array', () => {
    const arr = new Uint8Array([1, 2, 3]);
    const r = ok(arr);
    if (r.ok) expect(r.value).toBeInstanceOf(Uint8Array);
  });

  it('ok(Promise.resolve(1)) value는 Promise', () => {
    const p = Promise.resolve(1);
    const r = ok(p);
    if (r.ok) expect(r.value).toBeInstanceOf(Promise);
  });
});

// ── err() 추가 경계값 ──────────────────────────────────────────

describe('err() 추가 경계값', () => {
  it('err(AdevError) ok는 false', () => {
    const r = err(new AdevError('code', 'msg'));
    expect(r.ok).toBe(false);
  });

  it('err 결과는 readonly ok property', () => {
    const r = err(new AdevError('c', 'm'));
    expect(r.ok).toBe(false);
  });

  it('10번 err → 모두 ok=false', () => {
    for (let i = 0; i < 10; i++) {
      expect(err(new AdevError(`code-${i}`, `msg-${i}`)).ok).toBe(false);
    }
  });

  it('err(AdevError) error.code 문자열', () => {
    const r = err(new AdevError('my_code', 'my msg'));
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('err(AdevError) error.message 문자열', () => {
    const r = err(new AdevError('my_code', 'my msg'));
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('err 연속 5번 → 모두 다른 객체', () => {
    const results = Array.from({ length: 5 }, (_, i) => err(new AdevError(`c${i}`, `m${i}`)));
    for (let i = 0; i < 4; i++) {
      expect(results[i]).not.toBe(results[i + 1]);
    }
  });

  it('err(AdevError) code 긴 문자열 → ok=false', () => {
    const longCode = 'code_' + 'x'.repeat(100);
    const r = err(new AdevError(longCode, 'msg'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(longCode);
  });

  it('err(AdevError) message 빈 문자열 → ok=false', () => {
    const r = err(new AdevError('code', ''));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('');
  });

  it('err(AdevError) message 한국어 → ok=false', () => {
    const r = err(new AdevError('code', '한국어 에러 메시지'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('한국어');
  });

  it('err(AdevError) message 특수문자 포함 → ok=false', () => {
    const r = err(new AdevError('code', '!@#$%^&*()'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('!@#$%^&*()');
  });
});

// ── Result 추가 패턴 ──────────────────────────────────────────

describe('Result 추가 패턴', () => {
  it('ok와 err의 ok 필드 타입이 다름', () => {
    const o = ok(1);
    const e = err(new AdevError('c', 'm'));
    expect(o.ok).not.toBe(e.ok);
  });

  it('함수 반환 Result ok → value 접근', () => {
    const fn = (x: number): Result<number> => {
      if (x < 0) return err(new AdevError('negative', 'negative value'));
      return ok(x * 2);
    };
    const r = fn(5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(10);
  });

  it('함수 반환 Result err → error 접근', () => {
    const fn = (x: number): Result<number> => {
      if (x < 0) return err(new AdevError('negative', 'negative value'));
      return ok(x * 2);
    };
    const r = fn(-1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('negative');
  });

  it('배열 map으로 Result 생성 → 모두 ok', () => {
    const values = [1, 2, 3, 4, 5];
    const results = values.map(ok);
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
  });

  it('배열 map으로 err 생성 → 모두 ok=false', () => {
    const codes = ['a', 'b', 'c'];
    const results = codes.map((c) => err(new AdevError(c, c)));
    for (const r of results) {
      expect(r.ok).toBe(false);
    }
  });

  it('Result 중첩 3단계', () => {
    const r = ok(ok(ok(42)));
    expect(r.ok).toBe(true);
    if (r.ok && r.value.ok && r.value.value.ok) {
      expect(r.value.value.value).toBe(42);
    }
  });

  it('ok(string 배열) value 접근', () => {
    const arr = ['a', 'b', 'c'];
    const r = ok(arr);
    if (r.ok) {
      expect(r.value[0]).toBe('a');
      expect(r.value[2]).toBe('c');
    }
  });

  it('err(AdevError) 타입 가드로 분기', () => {
    const r: Result<number> = err(new AdevError('test', 'msg'));
    if (r.ok) {
      expect(true).toBe(false); // 실행 안 됨
    } else {
      expect(r.error.code).toBe('test');
    }
  });

  it('ok(number) 타입 가드로 분기', () => {
    const r: Result<number> = ok(99);
    if (!r.ok) {
      expect(true).toBe(false); // 실행 안 됨
    } else {
      expect(r.value).toBe(99);
    }
  });

  it('Result<void> ok → value undefined', () => {
    const r: Result<void> = ok(undefined);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  it('Result<string[]> ok → 배열 접근', () => {
    const r: Result<string[]> = ok(['x', 'y', 'z']);
    if (r.ok) {
      expect(r.value).toHaveLength(3);
      expect(r.value[1]).toBe('y');
    }
  });
});

// ── 리터럴 타입 추가 검증 ─────────────────────────────────────

describe('리터럴 타입 추가 검증', () => {
  it('Phase 배열 join → 유효 문자열', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    const joined = phases.join(',');
    expect(joined).toBe('DESIGN,CODE,TEST,VERIFY');
  });

  it('AgentName 배열 정렬 → 유효 배열', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    const sorted = [...agents].sort();
    expect(sorted.length).toBe(7);
  });

  it('FeatureStatus 배열 filter → pending만', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    const pending = statuses.filter((s) => s === 'pending');
    expect(pending.length).toBe(1);
  });

  it('MemoryType 배열 includes decision', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    expect(types.includes('decision')).toBe(true);
  });

  it('MemoryType 배열 includes feedback', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    expect(types.includes('feedback')).toBe(true);
  });

  it('Phase는 4개 정확히', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    expect(phases.length).toBe(4);
  });

  it('AgentName은 7개 정확히', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    expect(agents.length).toBe(7);
  });

  it('FeatureStatus는 7개 정확히', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    expect(statuses.length).toBe(7);
  });

  it('MemoryType은 4개 정확히', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    expect(types.length).toBe(4);
  });

  it('Phase 모든 값 대문자', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const p of phases) {
      expect(p).toBe(p.toUpperCase());
    }
  });

  it('AgentName 모든 값 소문자', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const a of agents) {
      expect(a).toBe(a.toLowerCase());
    }
  });

  it('FeatureStatus 모든 값 소문자', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    for (const s of statuses) {
      expect(s).toBe(s.toLowerCase());
    }
  });

  it('MemoryType 모든 값 소문자', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    for (const t of types) {
      expect(t).toBe(t.toLowerCase());
    }
  });

  it('AgentName reviewer 포함', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    expect(agents.includes('reviewer')).toBe(true);
  });

  it('AgentName documenter 포함', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    expect(agents.includes('documenter')).toBe(true);
  });

  it('AgentName qc 포함', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    expect(agents.includes('qc')).toBe(true);
  });

  it('FeatureStatus pending 포함', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    expect(statuses.includes('pending')).toBe(true);
  });

  it('FeatureStatus designing 포함', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    expect(statuses.includes('designing')).toBe(true);
  });

  it('FeatureStatus coding 포함', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    expect(statuses.includes('coding')).toBe(true);
  });

  it('FeatureStatus testing 포함', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    expect(statuses.includes('testing')).toBe(true);
  });

  it('FeatureStatus verifying 포함', () => {
    const statuses: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
    expect(statuses.includes('verifying')).toBe(true);
  });
});

// ── VectorRepository 인터페이스 구조 검증 ─────────────────────

describe('VectorRepository 인터페이스 구조 검증', () => {
  it('insert 메서드 시그니처 검증', () => {
    const mockRepo = {
      insert: async (_r: MemoryRecord) => ok(undefined),
      search: async () => ok([]),
      getById: async () => ok(null),
      update: async () => ok(undefined),
      delete: async () => ok(undefined),
    };
    expect(typeof mockRepo.insert).toBe('function');
  });

  it('search 메서드 시그니처 검증', () => {
    const mockRepo = {
      insert: async () => ok(undefined),
      search: async (_q: Float32Array, _l: number) => ok([] as MemoryRecord[]),
      getById: async () => ok(null),
      update: async () => ok(undefined),
      delete: async () => ok(undefined),
    };
    expect(typeof mockRepo.search).toBe('function');
  });

  it('getById 메서드 시그니처 검증', () => {
    const mockRepo = {
      insert: async () => ok(undefined),
      search: async () => ok([]),
      getById: async (_id: string) => ok(null as MemoryRecord | null),
      update: async () => ok(undefined),
      delete: async () => ok(undefined),
    };
    expect(typeof mockRepo.getById).toBe('function');
  });

  it('update 메서드 시그니처 검증', () => {
    const mockRepo = {
      insert: async () => ok(undefined),
      search: async () => ok([]),
      getById: async () => ok(null),
      update: async (_id: string, _p: Partial<MemoryRecord>) => ok(undefined),
      delete: async () => ok(undefined),
    };
    expect(typeof mockRepo.update).toBe('function');
  });

  it('delete 메서드 시그니처 검증', () => {
    const mockRepo = {
      insert: async () => ok(undefined),
      search: async () => ok([]),
      getById: async () => ok(null),
      update: async () => ok(undefined),
      delete: async (_id: string) => ok(undefined),
    };
    expect(typeof mockRepo.delete).toBe('function');
  });
});

// ── CodeRecord 인터페이스 구조 검증 ─────────────────────────

describe('CodeRecord 인터페이스 구조 검증', () => {
  it('CodeRecord 구조 생성 가능', () => {
    const record = {
      id: 'code-001',
      projectId: 'proj-001',
      filePath: 'src/core/config.ts',
      chunk: 'function getConfig() { return {}; }',
      embedding: new Float32Array(384),
      metadata: {
        language: 'typescript',
        module: 'src/core',
        functionName: 'getConfig',
        lastModified: new Date('2026-01-01'),
        modifiedBy: 'coder',
      },
    };
    expect(record.id).toBe('code-001');
    expect(record.metadata.language).toBe('typescript');
  });

  it('CodeRecord embedding은 Float32Array', () => {
    const record = {
      id: 'code-002',
      projectId: 'proj-001',
      filePath: 'src/layer1/planner.ts',
      chunk: 'class Planner {}',
      embedding: new Float32Array(384),
      metadata: {
        language: 'typescript',
        module: 'src/layer1',
        functionName: 'Planner',
        lastModified: new Date(),
        modifiedBy: 'architect',
      },
    };
    expect(record.embedding).toBeInstanceOf(Float32Array);
  });

  it('CodeRecord metadata.functionName은 문자열', () => {
    const record = {
      id: 'code-003',
      projectId: 'proj-001',
      filePath: 'src/rag/indexer.ts',
      chunk: 'async function indexCode() {}',
      embedding: new Float32Array(384),
      metadata: {
        language: 'typescript',
        module: 'src/rag',
        functionName: 'indexCode',
        lastModified: new Date(),
        modifiedBy: 'coder',
      },
    };
    expect(typeof record.metadata.functionName).toBe('string');
  });

  it('CodeRecord metadata.module은 문자열', () => {
    const record = {
      id: 'code-004',
      projectId: 'proj-001',
      filePath: 'src/mcp/server.ts',
      chunk: 'class McpServer {}',
      embedding: new Float32Array(384),
      metadata: {
        language: 'typescript',
        module: 'src/mcp',
        functionName: 'McpServer',
        lastModified: new Date(),
        modifiedBy: 'coder',
      },
    };
    expect(typeof record.metadata.module).toBe('string');
  });

  it('CodeRecord metadata.lastModified는 Date', () => {
    const now = new Date();
    const record = {
      id: 'code-005',
      projectId: 'proj-001',
      filePath: 'src/auth/api-key.ts',
      chunk: 'class ApiKeyAuth {}',
      embedding: new Float32Array(384),
      metadata: {
        language: 'typescript',
        module: 'src/auth',
        functionName: 'ApiKeyAuth',
        lastModified: now,
        modifiedBy: 'coder',
      },
    };
    expect(record.metadata.lastModified).toBeInstanceOf(Date);
  });

  it('CodeRecord 여러 개 생성 → 각 filePath 다름', () => {
    const paths = ['src/core/a.ts', 'src/core/b.ts', 'src/layer1/c.ts'];
    const records = paths.map((fp, i) => ({
      id: `code-${i}`,
      projectId: 'proj-001',
      filePath: fp,
      chunk: `// ${fp}`,
      embedding: new Float32Array(384),
      metadata: {
        language: 'typescript',
        module: fp.split('/').slice(0, 2).join('/'),
        functionName: `fn${i}`,
        lastModified: new Date(),
        modifiedBy: 'coder',
      },
    }));
    const uniquePaths = new Set(records.map((r) => r.filePath));
    expect(uniquePaths.size).toBe(3);
  });
});

// ── MemoryRecord 심화 경계값 ─────────────────────────────────

describe('MemoryRecord 심화 경계값', () => {
  it('MemoryRecord id는 빈 문자열도 허용', () => {
    const record: MemoryRecord = {
      id: '',
      projectId: 'proj-001',
      type: 'conversation',
      content: 'test',
      embedding: new Float32Array(0),
      metadata: { phase: 'DESIGN', featureId: '', agentName: 'coder', timestamp: new Date() },
    };
    expect(record.id).toBe('');
  });

  it('MemoryRecord projectId 긴 문자열 허용', () => {
    const record: MemoryRecord = {
      id: 'mem-long-proj',
      projectId: 'p'.repeat(200),
      type: 'decision',
      content: 'test content',
      embedding: new Float32Array(384),
      metadata: { phase: 'CODE', featureId: 'feat-1', agentName: 'architect', timestamp: new Date() },
    };
    expect(record.projectId.length).toBe(200);
  });

  it('MemoryRecord content 긴 문자열 허용', () => {
    const content = 'x'.repeat(10000);
    const record: MemoryRecord = {
      id: 'mem-long-content',
      projectId: 'proj-001',
      type: 'feedback',
      content,
      embedding: new Float32Array(384),
      metadata: { phase: 'VERIFY', featureId: 'feat-1', agentName: 'reviewer', timestamp: new Date() },
    };
    expect(record.content.length).toBe(10000);
  });

  it('MemoryRecord embedding 차원 1 허용', () => {
    const record: MemoryRecord = {
      id: 'mem-dim1',
      projectId: 'proj-001',
      type: 'error',
      content: 'error content',
      embedding: new Float32Array(1),
      metadata: { phase: 'TEST', featureId: 'feat-1', agentName: 'qc', timestamp: new Date() },
    };
    expect(record.embedding.length).toBe(1);
  });

  it('MemoryRecord embedding 차원 768 허용', () => {
    const record: MemoryRecord = {
      id: 'mem-dim768',
      projectId: 'proj-001',
      type: 'conversation',
      content: 'large embedding',
      embedding: new Float32Array(768),
      metadata: { phase: 'DESIGN', featureId: 'feat-1', agentName: 'qa', timestamp: new Date() },
    };
    expect(record.embedding.length).toBe(768);
  });

  it('MemoryRecord metadata.featureId 빈 문자열 허용', () => {
    const record: MemoryRecord = {
      id: 'mem-no-feat',
      projectId: 'proj-001',
      type: 'conversation',
      content: 'no feature',
      embedding: new Float32Array(384),
      metadata: { phase: 'DESIGN', featureId: '', agentName: 'architect', timestamp: new Date() },
    };
    expect(record.metadata.featureId).toBe('');
  });

  it('MemoryRecord metadata.timestamp 과거 날짜 허용', () => {
    const past = new Date('2000-01-01');
    const record: MemoryRecord = {
      id: 'mem-past',
      projectId: 'proj-001',
      type: 'error',
      content: 'old error',
      embedding: new Float32Array(384),
      metadata: { phase: 'TEST', featureId: 'feat-1', agentName: 'tester', timestamp: past },
    };
    expect(record.metadata.timestamp.getFullYear()).toBe(2000);
  });

  it('MemoryRecord metadata.timestamp 미래 날짜 허용', () => {
    const future = new Date('2099-12-31');
    const record: MemoryRecord = {
      id: 'mem-future',
      projectId: 'proj-001',
      type: 'decision',
      content: 'future decision',
      embedding: new Float32Array(384),
      metadata: { phase: 'DESIGN', featureId: 'feat-1', agentName: 'architect', timestamp: future },
    };
    expect(record.metadata.timestamp.getFullYear()).toBe(2099);
  });

  it('MemoryRecord content JSON 문자열 허용', () => {
    const content = JSON.stringify({ key: 'value', num: 42 });
    const record: MemoryRecord = {
      id: 'mem-json',
      projectId: 'proj-001',
      type: 'conversation',
      content,
      embedding: new Float32Array(384),
      metadata: { phase: 'CODE', featureId: 'feat-1', agentName: 'coder', timestamp: new Date() },
    };
    expect(JSON.parse(record.content)).toEqual({ key: 'value', num: 42 });
  });

  it('MemoryRecord 50개 생성 → 모두 유효한 type', () => {
    const types: MemoryType[] = ['conversation', 'decision', 'feedback', 'error'];
    for (let i = 0; i < 50; i++) {
      const type = types[i % 4] as MemoryType;
      const record: MemoryRecord = {
        id: `mem-batch-${i}`,
        projectId: 'proj-001',
        type,
        content: `content ${i}`,
        embedding: new Float32Array(384),
        metadata: { phase: 'CODE', featureId: `feat-${i}`, agentName: 'coder', timestamp: new Date() },
      };
      expect(types.includes(record.type)).toBe(true);
    }
  });
});

// ── DesignDecision 심화 경계값 ───────────────────────────────

describe('DesignDecision 심화 경계값', () => {
  it('DesignDecision alternatives 100개 허용', () => {
    const alts = Array.from({ length: 100 }, (_, i) => `option-${i}`);
    const decision: DesignDecision = {
      id: 'dd-big-alts',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: '100개 대안 중 선택',
      rationale: '많은 옵션 비교',
      alternatives: alts,
      decidedBy: ['architect'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(decision.alternatives.length).toBe(100);
  });

  it('DesignDecision decidedBy 7명 에이전트 전원', () => {
    const decision: DesignDecision = {
      id: 'dd-all-agents',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: '전원 합의',
      rationale: '만장일치',
      alternatives: [],
      decidedBy: ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(decision.decidedBy.length).toBe(7);
  });

  it('DesignDecision id UUID v4 형식', () => {
    const decision: DesignDecision = {
      id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: 'UUID test',
      rationale: 'id format check',
      alternatives: [],
      decidedBy: ['architect'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(decision.id).toMatch(/-/);
  });

  it('DesignDecision rationale 빈 문자열 허용', () => {
    const decision: DesignDecision = {
      id: 'dd-empty-rat',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: '결정',
      rationale: '',
      alternatives: [],
      decidedBy: ['architect'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(decision.rationale).toBe('');
  });

  it('DesignDecision decision 긴 문자열 허용', () => {
    const decision: DesignDecision = {
      id: 'dd-long',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: 'd'.repeat(1000),
      rationale: '긴 결정문',
      alternatives: [],
      decidedBy: ['architect'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(decision.decision.length).toBe(1000);
  });
});

// ── FailureRecord 심화 경계값 ────────────────────────────────

describe('FailureRecord 심화 경계값', () => {
  it('FailureRecord failureType 빈 문자열 허용', () => {
    const failure: FailureRecord = {
      id: 'fail-empty-type',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'TEST',
      failureType: '',
      rootCause: '원인 미상',
      resolution: '재조사 필요',
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(failure.failureType).toBe('');
  });

  it('FailureRecord resolution 긴 문자열 허용', () => {
    const failure: FailureRecord = {
      id: 'fail-long-res',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'CODE',
      failureType: 'type_error',
      rootCause: '타입 불일치',
      resolution: 'r'.repeat(2000),
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(failure.resolution.length).toBe(2000);
  });

  it('FailureRecord 4개 Phase 모두 유효', () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const failure: FailureRecord = {
        id: `fail-phase-${phase}`,
        projectId: 'proj-001',
        featureId: 'feat-001',
        phase,
        failureType: 'test_failure',
        rootCause: '원인',
        resolution: '해결',
        embedding: new Float32Array(384),
        timestamp: new Date(),
      };
      expect(failure.phase).toBe(phase);
    }
  });

  it('FailureRecord timestamp는 Date', () => {
    const failure: FailureRecord = {
      id: 'fail-ts-check',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'VERIFY',
      failureType: 'verify_failed',
      rootCause: 'e2e 실패',
      resolution: '재시도',
      embedding: new Float32Array(384),
      timestamp: new Date('2026-03-01'),
    };
    expect(failure.timestamp).toBeInstanceOf(Date);
  });

  it('FailureRecord rootCause 영문 허용', () => {
    const failure: FailureRecord = {
      id: 'fail-eng',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'TEST',
      failureType: 'assertion_error',
      rootCause: 'Expected value to be truthy',
      resolution: 'Fix the assertion',
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    expect(failure.rootCause).toContain('Expected');
  });
});

// ── ok/err 복합 패턴 ──────────────────────────────────────────

describe('ok/err 복합 패턴', () => {
  it('ok(MemoryRecord) → value는 MemoryRecord', () => {
    const record: MemoryRecord = {
      id: 'mem-ok',
      projectId: 'proj-001',
      type: 'conversation',
      content: 'test',
      embedding: new Float32Array(384),
      metadata: { phase: 'DESIGN', featureId: 'feat-1', agentName: 'coder', timestamp: new Date() },
    };
    const result = ok(record);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('mem-ok');
  });

  it('err(AdevError) → code 유지', () => {
    const error = new AdevError('mem_not_found', '메모리 레코드를 찾을 수 없음');
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('mem_not_found');
  });

  it('ok(DesignDecision) → value는 DesignDecision', () => {
    const decision: DesignDecision = {
      id: 'dd-ok',
      projectId: 'proj-001',
      featureId: 'feat-001',
      decision: 'REST API',
      rationale: '단순성',
      alternatives: [],
      decidedBy: ['architect'],
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    const result = ok(decision);
    if (result.ok) expect(result.value.decision).toBe('REST API');
  });

  it('ok(FailureRecord) → value는 FailureRecord', () => {
    const failure: FailureRecord = {
      id: 'fail-ok',
      projectId: 'proj-001',
      featureId: 'feat-001',
      phase: 'TEST',
      failureType: 'test_failed',
      rootCause: '원인',
      resolution: '해결',
      embedding: new Float32Array(384),
      timestamp: new Date(),
    };
    const result = ok(failure);
    if (result.ok) expect(result.value.phase).toBe('TEST');
  });

  it('ok(null as MemoryRecord) → value null', () => {
    const result = ok(null as unknown as MemoryRecord);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('Result<MemoryRecord[]> ok → 배열 접근', () => {
    const records: MemoryRecord[] = [];
    const result: Result<MemoryRecord[]> = ok(records);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('Result<DesignDecision | null> ok null → getById 패턴', () => {
    const result: Result<DesignDecision | null> = ok(null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('err(AdevError) → FailureRecord 검색 실패 시뮬레이션', () => {
    const searchFail = (): Result<FailureRecord[]> => err(new AdevError('db_error', 'DB 연결 실패'));
    const result = searchFail();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('DB');
  });

  it('ok([]) → 빈 결과 검색 시뮬레이션', () => {
    const emptySearch = (): Result<MemoryRecord[]> => ok([]);
    const result = emptySearch();
    if (result.ok) expect(result.value.length).toBe(0);
  });

  it('연속 ok/err 분기 로직', () => {
    const process = (id: string): Result<string> => {
      if (id.startsWith('valid')) return ok(`processed-${id}`);
      return err(new AdevError('invalid_id', `Invalid: ${id}`));
    };
    const r1 = process('valid-001');
    const r2 = process('bad-id');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    if (r1.ok) expect(r1.value).toBe('processed-valid-001');
    if (!r2.ok) expect(r2.error.code).toBe('invalid_id');
  });
});
