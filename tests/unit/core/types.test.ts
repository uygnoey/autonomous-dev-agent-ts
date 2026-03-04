import { describe, expect, it } from 'bun:test';
import { AdevError } from '../../../src/core/errors.js';
import { err, ok } from '../../../src/core/types.js';
import type {
  AgentName,
  DesignDecision,
  FailureRecord,
  FeatureStatus,
  MemoryRecord,
  MemoryType,
  Phase,
  Result,
} from '../../../src/core/types.js';

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
});
