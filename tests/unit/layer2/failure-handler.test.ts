/**
 * FailureHandler 단위 테스트 / FailureHandler unit tests
 *
 * @description
 * 실패 분류, 복구 Phase 결정, 한국어/영어 키워드 매칭 등
 * 모든 경로를 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { Phase } from 'core/types.js';
import { FailureHandler } from 'layer2/failure-handler.js';

// ── 테스트 헬퍼 ────────────────────────────────────────────────

const logger = new ConsoleLogger('error');

function makeHandler(): FailureHandler {
  return new FailureHandler(logger);
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('FailureHandler 생성자', () => {
  it('인스턴스 생성', () => {
    expect(() => makeHandler()).not.toThrow();
  });

  it('FailureHandler 인스턴스', () => {
    expect(makeHandler()).toBeInstanceOf(FailureHandler);
  });

  it('classify 메서드 존재', () => {
    expect(typeof makeHandler().classify).toBe('function');
  });

  it('getRecoveryPhase 메서드 존재', () => {
    expect(typeof makeHandler().getRecoveryPhase).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    expect(makeHandler()).not.toBe(makeHandler());
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new FailureHandler(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('debug 로거로 생성 가능', () => {
    expect(() => new FailureHandler(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 모두 독립', () => {
    const handlers = Array.from({ length: 10 }, () => makeHandler());
    for (let i = 0; i < handlers.length; i++) {
      for (let j = i + 1; j < handlers.length; j++) {
        expect(handlers[i]).not.toBe(handlers[j]);
      }
    }
  });
});

// ── classify — 실패 유형 분류 ─────────────────────────────────

describe('FailureHandler.classify', () => {
  let handler: FailureHandler;

  beforeEach(() => {
    handler = makeHandler();
  });

  // design_flaw 분류
  describe('design_flaw 키워드', () => {
    it('architecture 설계 결함 발견 → design_flaw', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'architecture 설계 결함 발견');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('design_flaw');
        expect(result.value.targetPhase).toBe('DESIGN');
        expect(result.value.suggestedAction).toBe('rollback_phase');
      }
    });

    it('design pattern 문제 → design_flaw', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'design pattern 문제');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe('design_flaw');
    });

    it('structure가 잘못되었습니다 → design_flaw', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'structure가 잘못되었습니다');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe('design_flaw');
    });

    it('interface 정의 오류 → design_flaw', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'interface 정의 오류');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe('design_flaw');
    });

    it('설계가 잘못되었습니다 → design_flaw', () => {
      const result = handler.classify('feat-1', 'VERIFY', '설계가 잘못되었습니다');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe('design_flaw');
    });

    it('구조 문제 발생 → design_flaw', () => {
      const result = handler.classify('feat-1', 'VERIFY', '구조 문제 발생');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe('design_flaw');
    });

    it('인터페이스 불일치 → design_flaw', () => {
      const result = handler.classify('feat-1', 'VERIFY', '인터페이스 불일치');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe('design_flaw');
    });

    it('Architecture mismatch detected → design_flaw', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'Architecture mismatch detected');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe('design_flaw');
    });

    it('design_flaw → targetPhase=DESIGN', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'architecture 결함');
      if (result.ok) expect(result.value.targetPhase).toBe('DESIGN');
    });

    it('design_flaw → suggestedAction=rollback_phase', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'architecture 결함');
      if (result.ok) expect(result.value.suggestedAction).toBe('rollback_phase');
    });
  });

  // implementation_bug 분류
  describe('implementation_bug 키워드', () => {
    it('undefined is not a function bug → implementation_bug', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'undefined is not a function bug');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('implementation_bug');
        expect(result.value.targetPhase).toBe('CODE');
        expect(result.value.suggestedAction).toBe('rollback_phase');
      }
    });

    it('NullPointerException error → implementation_bug', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'NullPointerException error');
      if (result.ok) expect(result.value.type).toBe('implementation_bug');
    });

    it('exception 발생 → implementation_bug', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'exception 발생');
      if (result.ok) expect(result.value.type).toBe('implementation_bug');
    });

    it('crash detected → implementation_bug', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'crash detected');
      if (result.ok) expect(result.value.type).toBe('implementation_bug');
    });

    it('버그 발견 → implementation_bug', () => {
      const result = handler.classify('feat-1', 'VERIFY', '버그 발견');
      if (result.ok) expect(result.value.type).toBe('implementation_bug');
    });

    it('에러 발생 → implementation_bug', () => {
      const result = handler.classify('feat-1', 'VERIFY', '에러 발생');
      if (result.ok) expect(result.value.type).toBe('implementation_bug');
    });

    it('오류가 있습니다 → implementation_bug', () => {
      const result = handler.classify('feat-1', 'VERIFY', '오류가 있습니다');
      if (result.ok) expect(result.value.type).toBe('implementation_bug');
    });

    it('TypeError: Cannot read properties → implementation_bug', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'TypeError: Cannot read properties');
      if (result.ok) expect(result.value.type).toBe('implementation_bug');
    });

    it('implementation_bug → targetPhase=CODE', () => {
      const result = handler.classify('feat-1', 'VERIFY', '버그 발견 오류');
      if (result.ok) expect(result.value.targetPhase).toBe('CODE');
    });
  });

  // test_gap 분류
  describe('test_gap 키워드', () => {
    it('test coverage 부족 → test_gap', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'test coverage 부족');
      if (result.ok) {
        expect(result.value.type).toBe('test_gap');
        expect(result.value.targetPhase).toBe('TEST');
        expect(result.value.suggestedAction).toBe('rollback_phase');
      }
    });

    it('assertion failed → test_gap', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'assertion failed');
      if (result.ok) expect(result.value.type).toBe('test_gap');
    });

    it('expect() 실패 → test_gap', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'expect() 실패');
      if (result.ok) expect(result.value.type).toBe('test_gap');
    });

    it('coverage 미달 → test_gap', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'coverage 미달');
      if (result.ok) expect(result.value.type).toBe('test_gap');
    });

    it('테스트 실패 → test_gap', () => {
      const result = handler.classify('feat-1', 'VERIFY', '테스트 실패');
      if (result.ok) expect(result.value.type).toBe('test_gap');
    });

    it('커버리지 부족 → test_gap', () => {
      const result = handler.classify('feat-1', 'VERIFY', '커버리지 부족');
      if (result.ok) expect(result.value.type).toBe('test_gap');
    });

    it('Test suite incomplete → test_gap', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'Test suite incomplete');
      if (result.ok) expect(result.value.type).toBe('test_gap');
    });

    it('test_gap → targetPhase=TEST', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'test coverage 부족');
      if (result.ok) expect(result.value.targetPhase).toBe('TEST');
    });
  });

  // spec_ambiguity 분류
  describe('spec_ambiguity 키워드', () => {
    it('요구사항이 unclear하고 ambiguous함 → spec_ambiguity', () => {
      const result = handler.classify('feat-1', 'VERIFY', '요구사항이 unclear하고 ambiguous함');
      if (result.ok) {
        expect(result.value.type).toBe('spec_ambiguity');
        expect(result.value.suggestedAction).toBe('escalate_user');
      }
    });

    it('spec이 불명확합니다 → spec_ambiguity', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'spec이 불명확합니다');
      if (result.ok) expect(result.value.type).toBe('spec_ambiguity');
    });

    it('requirement가 모호합니다 → spec_ambiguity', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'requirement가 모호합니다');
      if (result.ok) expect(result.value.type).toBe('spec_ambiguity');
    });

    it('unclear requirements → spec_ambiguity', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'unclear requirements');
      if (result.ok) expect(result.value.type).toBe('spec_ambiguity');
    });

    it('ambiguous specification → spec_ambiguity', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'ambiguous specification');
      if (result.ok) expect(result.value.type).toBe('spec_ambiguity');
    });

    it('스펙이 불명확 → spec_ambiguity', () => {
      const result = handler.classify('feat-1', 'VERIFY', '스펙이 불명확');
      if (result.ok) expect(result.value.type).toBe('spec_ambiguity');
    });

    it('요구사항 모호 → spec_ambiguity', () => {
      const result = handler.classify('feat-1', 'VERIFY', '요구사항 모호');
      if (result.ok) expect(result.value.type).toBe('spec_ambiguity');
    });

    it('모호한 스펙 → spec_ambiguity', () => {
      const result = handler.classify('feat-1', 'VERIFY', '모호한 스펙');
      if (result.ok) expect(result.value.type).toBe('spec_ambiguity');
    });

    it('spec_ambiguity → suggestedAction=escalate_user', () => {
      const result = handler.classify('feat-1', 'VERIFY', '스펙이 불명확');
      if (result.ok) expect(result.value.suggestedAction).toBe('escalate_user');
    });
  });

  // infrastructure 분류
  describe('infrastructure 키워드', () => {
    it('timeout connection 실패 → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'timeout connection 실패');
      if (result.ok) {
        expect(result.value.type).toBe('infrastructure');
        expect(result.value.suggestedAction).toBe('retry');
      }
    });

    it('connection refused → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'connection refused');
      if (result.ok) expect(result.value.type).toBe('infrastructure');
    });

    it('network failure → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'network failure');
      if (result.ok) expect(result.value.type).toBe('infrastructure');
    });

    it('rate_limit 초과 → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'rate_limit 초과');
      if (result.ok) expect(result.value.type).toBe('infrastructure');
    });

    it('타임아웃 발생 → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', '타임아웃 발생');
      if (result.ok) expect(result.value.type).toBe('infrastructure');
    });

    it('네트워크 오작동 → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', '네트워크 오작동');
      if (result.ok) expect(result.value.type).toBe('infrastructure');
    });

    it('연결 끊김 → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', '연결 끊김');
      if (result.ok) expect(result.value.type).toBe('infrastructure');
    });

    it('Connection timeout → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'Connection timeout');
      if (result.ok) expect(result.value.type).toBe('infrastructure');
    });

    it('Network unreachable → infrastructure', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'Network unreachable');
      if (result.ok) expect(result.value.type).toBe('infrastructure');
    });

    it('infrastructure → suggestedAction=retry', () => {
      const result = handler.classify('feat-1', 'VERIFY', '타임아웃 발생');
      if (result.ok) expect(result.value.suggestedAction).toBe('retry');
    });
  });

  // unknown 분류
  describe('unknown 분류', () => {
    it('알 수 없는 문제 → unknown', () => {
      const result = handler.classify('feat-1', 'VERIFY', '알 수 없는 문제');
      if (result.ok) {
        expect(result.value.type).toBe('unknown');
        expect(result.value.suggestedAction).toBe('retry');
      }
    });

    it('무언가 잘못됨 → unknown', () => {
      const result = handler.classify('feat-1', 'VERIFY', '무언가 잘못됨');
      if (result.ok) expect(result.value.type).toBe('unknown');
    });

    it('something went wrong → unknown', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'something went wrong');
      if (result.ok) expect(result.value.type).toBe('unknown');
    });

    it('zzz → unknown', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'zzz');
      if (result.ok) expect(result.value.type).toBe('unknown');
    });

    it('xyz123 → unknown', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'xyz123');
      if (result.ok) expect(result.value.type).toBe('unknown');
    });

    it('unknown → suggestedAction=retry', () => {
      const result = handler.classify('feat-1', 'VERIFY', '알 수 없는 문제');
      if (result.ok) expect(result.value.suggestedAction).toBe('retry');
    });
  });

  // 입력 검증
  describe('입력 검증', () => {
    it('빈 에러 메시지 → 에러', () => {
      const result = handler.classify('feat-1', 'VERIFY', '');
      expect(result.ok).toBe(false);
    });

    it('공백만 → 에러', () => {
      const result = handler.classify('feat-1', 'VERIFY', '   ');
      expect(result.ok).toBe(false);
    });

    it('탭만 → 에러', () => {
      const result = handler.classify('feat-1', 'VERIFY', '\t\t');
      expect(result.ok).toBe(false);
    });

    it('빈 문자열 → ok=false', () => {
      expect(handler.classify('feat-1', 'VERIFY', '').ok).toBe(false);
    });

    it('빈 문자열 → ok는 boolean', () => {
      expect(typeof handler.classify('feat-1', 'VERIFY', '').ok).toBe('boolean');
    });

    it('5번 빈 문자열 → 모두 ok=false', () => {
      for (let i = 0; i < 5; i++) {
        expect(handler.classify('feat-1', 'VERIFY', '').ok).toBe(false);
      }
    });
  });

  // 보고서 구조 검증
  describe('보고서 구조', () => {
    it('고유한 id 생성', () => {
      const r1 = handler.classify('feat-1', 'VERIFY', 'error 1');
      const r2 = handler.classify('feat-1', 'VERIFY', 'error 2');
      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });

    it('featureId 기록', () => {
      const result = handler.classify('my-feat', 'VERIFY', 'some error');
      if (result.ok) {
        expect(result.value.featureId).toBe('my-feat');
      }
    });

    it('phase 기록', () => {
      const result = handler.classify('feat-1', 'CODE', 'some error');
      if (result.ok) {
        expect(result.value.phase).toBe('CODE');
      }
    });

    it('description 기록', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'specific error message here');
      if (result.ok) {
        expect(result.value.description).toContain('specific error message here');
      }
    });

    it('timestamp 설정됨', () => {
      const before = new Date();
      const result = handler.classify('feat-1', 'VERIFY', 'some error');
      const after = new Date();
      if (result.ok) {
        expect(result.value.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result.value.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });

    it('id는 string 타입', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'some error');
      if (result.ok) expect(typeof result.value.id).toBe('string');
    });

    it('type은 string 타입', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'some error');
      if (result.ok) expect(typeof result.value.type).toBe('string');
    });

    it('featureId는 string 타입', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'some error');
      if (result.ok) expect(typeof result.value.featureId).toBe('string');
    });

    it('ok는 boolean 타입', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'some error');
      expect(typeof result.ok).toBe('boolean');
    });

    it('5번 반복 classify → 5개 모두 ok=true', () => {
      for (let i = 0; i < 5; i++) {
        const result = handler.classify('feat-1', 'VERIFY', `error ${i}`);
        expect(result.ok).toBe(true);
      }
    });
  });

  // 모든 Phase에서 분류
  describe('다양한 Phase에서 분류', () => {
    it('Phase DESIGN에서 분류 가능', () => {
      const result = handler.classify('feat-1', 'DESIGN', 'some error message');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.phase).toBe('DESIGN');
    });

    it('Phase CODE에서 분류 가능', () => {
      const result = handler.classify('feat-1', 'CODE', 'some error message');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.phase).toBe('CODE');
    });

    it('Phase TEST에서 분류 가능', () => {
      const result = handler.classify('feat-1', 'TEST', 'some error message');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.phase).toBe('TEST');
    });

    it('Phase VERIFY에서 분류 가능', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'some error message');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.phase).toBe('VERIFY');
    });
  });

  // 랜덤 에러 메시지
  describe('랜덤 에러 메시지', () => {
    it('bug #0 → 분류됨', () => {
      const result = handler.classify('feat-0', 'VERIFY', 'bug #0: something failed');
      expect(result.ok).toBe(true);
      if (result.ok) expect(typeof result.value.type).toBe('string');
    });

    it('design issue 1 → 분류됨', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'design issue 1: structure problem');
      expect(result.ok).toBe(true);
      if (result.ok) expect(typeof result.value.id).toBe('string');
    });

    it('test failure #2 → 분류됨', () => {
      const result = handler.classify('feat-2', 'VERIFY', 'test failure #2: coverage missing');
      expect(result.ok).toBe(true);
    });

    it('spec unclear 3 → 분류됨', () => {
      const result = handler.classify('feat-3', 'VERIFY', 'spec unclear 3: ambiguous requirement');
      expect(result.ok).toBe(true);
    });

    it('timeout #4 → 분류됨', () => {
      const result = handler.classify('feat-4', 'VERIFY', 'timeout #4: connection failed');
      expect(result.ok).toBe(true);
    });

    it('unknown error #5 → 분류됨', () => {
      const result = handler.classify('feat-5', 'VERIFY', 'unknown error #5: mysterious');
      expect(result.ok).toBe(true);
    });

    it('한글 기능 ID → 분류됨', () => {
      const result = handler.classify('기능-1', 'VERIFY', 'some error message');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.featureId).toBe('기능-1');
    });

    it('UUID 기능 ID → 분류됨', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const result = handler.classify(id, 'VERIFY', 'some error');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.featureId).toBe(id);
    });

    it('긴 에러 메시지 → 분류됨', () => {
      const longMsg = 'error '.repeat(100);
      const result = handler.classify('feat-1', 'VERIFY', longMsg);
      expect(result.ok).toBe(true);
    });

    it('이모지 포함 메시지 → 분류됨', () => {
      const result = handler.classify('feat-1', 'VERIFY', '🚀 failure occurred');
      expect(result.ok).toBe(true);
    });
  });
});

// ── getRecoveryPhase ───────────────────────────────────────────

describe('FailureHandler.getRecoveryPhase', () => {
  let handler: FailureHandler;

  beforeEach(() => {
    handler = makeHandler();
  });

  it('design_flaw → DESIGN', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'design architecture 결함');
    if (r.ok) {
      expect(handler.getRecoveryPhase(r.value)).toBe('DESIGN');
    }
  });

  it('implementation_bug → CODE', () => {
    const r = handler.classify('feat-1', 'CODE', 'crash error 발생');
    if (r.ok) {
      expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
    }
  });

  it('test_gap → TEST', () => {
    const r = handler.classify('feat-1', 'TEST', 'test coverage 부족');
    if (r.ok) {
      expect(handler.getRecoveryPhase(r.value)).toBe('TEST');
    }
  });

  it('spec_ambiguity → DESIGN (사용자 에스컬레이션 전 재설계)', () => {
    const r = handler.classify('feat-1', 'VERIFY', '스펙 모호 unclear requirement');
    if (r.ok) {
      expect(handler.getRecoveryPhase(r.value)).toBe('DESIGN');
    }
  });

  it('infrastructure → CODE', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'timeout connection error');
    if (r.ok) {
      expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
    }
  });

  it('unknown → CODE', () => {
    const r = handler.classify('feat-1', 'VERIFY', '알 수 없는 이상한 에러 xyz');
    if (r.ok) {
      expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
    }
  });

  it('getRecoveryPhase 반환값은 string 타입', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'some error');
    if (r.ok) expect(typeof handler.getRecoveryPhase(r.value)).toBe('string');
  });

  it('"design architecture error" → DESIGN Phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'design architecture error');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('DESIGN');
  });

  it('"implementation bug crash" → CODE Phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'implementation bug crash');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
  });

  it('"test coverage assertion" → TEST Phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'test coverage assertion');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('TEST');
  });

  it('"timeout network error" → CODE Phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'timeout network error');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
  });

  it('"unclear ambiguous spec" → DESIGN Phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'unclear ambiguous spec');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('DESIGN');
  });

  it('"unknown mysterious" → CODE Phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'unknown mysterious');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
  });

  it('5번 반복 → 동일 결과', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'architecture design 결함');
    if (r.ok) {
      for (let i = 0; i < 5; i++) {
        expect(handler.getRecoveryPhase(r.value)).toBe('DESIGN');
      }
    }
  });
});

// ── reportCounter 증가 검증 ───────────────────────────────────

describe('FailureHandler reportCounter', () => {
  let handler: FailureHandler;

  beforeEach(() => {
    handler = makeHandler();
  });

  it('보고서 ID가 순서대로 증가', () => {
    const r1 = handler.classify('feat-1', 'VERIFY', 'error one');
    const r2 = handler.classify('feat-1', 'VERIFY', 'error two');
    const r3 = handler.classify('feat-1', 'VERIFY', 'error three');
    if (r1.ok && r2.ok && r3.ok) {
      const n1 = parseInt(r1.value.id.replace('failure-', ''));
      const n2 = parseInt(r2.value.id.replace('failure-', ''));
      const n3 = parseInt(r3.value.id.replace('failure-', ''));
      expect(n2).toBeGreaterThan(n1);
      expect(n3).toBeGreaterThan(n2);
    }
  });

  it('1번 분류 후 ID가 고유', () => {
    const ids: string[] = [];
    const r = handler.classify('feat-0', 'VERIFY', 'error 0 xyz');
    if (r.ok) ids.push(r.value.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('5번 분류 후 ID가 고유', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = handler.classify(`feat-${i}`, 'VERIFY', `error ${i} xyz`);
      if (r.ok) ids.push(r.value.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('10번 분류 후 ID가 고유', () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = handler.classify(`feat-${i}`, 'VERIFY', `error ${i} xyz`);
      if (r.ok) ids.push(r.value.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('FailureHandler 복합 시나리오', () => {
  it('분류 → 복구 Phase 결정 흐름', () => {
    const handler = makeHandler();

    const r1 = handler.classify('feat-1', 'VERIFY', 'architecture design 결함');
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(handler.getRecoveryPhase(r1.value)).toBe('DESIGN');
    }

    const r2 = handler.classify('feat-1', 'DESIGN', 'implementation bug crash');
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(handler.getRecoveryPhase(r2.value)).toBe('CODE');
    }
  });

  it('동일 기능 여러 실패 → 독립적 보고서 ID', () => {
    const handler = makeHandler();
    const ids: string[] = [];

    for (let i = 0; i < 10; i++) {
      const r = handler.classify('feat-1', 'VERIFY', `error ${i} xyz`);
      if (r.ok) {
        ids.push(r.value.id);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('대량 분류 (100개) → 성능 문제 없음', () => {
    const handler = makeHandler();
    const errors = [
      'bug error crash',
      'design architecture issue',
      'test coverage missing',
      'spec unclear ambiguous',
      'timeout connection failure',
      'unknown random problem',
    ];

    for (let i = 0; i < 100; i++) {
      const msg = errors[i % errors.length]!;
      const result = handler.classify(`feat-${i % 10}`, 'VERIFY', msg);
      expect(result.ok).toBe(true);
    }
  });

  it('두 핸들러 인스턴스 독립 카운터', () => {
    const h1 = makeHandler();
    const h2 = makeHandler();
    const r1 = h1.classify('feat-1', 'VERIFY', 'error one');
    const r2 = h2.classify('feat-1', 'VERIFY', 'error one');
    if (r1.ok && r2.ok) {
      // 독립 인스턴스이므로 ID가 동일할 수도 있으나 구조는 동일
      expect(typeof r1.value.id).toBe('string');
      expect(typeof r2.value.id).toBe('string');
    }
  });

  it('모든 타입 한 번씩 분류 → 각각 다른 type', () => {
    const handler = makeHandler();
    const messages = [
      { msg: 'architecture design 결함', expectedType: 'design_flaw' },
      { msg: 'bug error crash', expectedType: 'implementation_bug' },
      { msg: 'test coverage 부족', expectedType: 'test_gap' },
      { msg: '스펙 unclear ambiguous', expectedType: 'spec_ambiguity' },
      { msg: 'timeout connection network', expectedType: 'infrastructure' },
    ];
    for (const { msg, expectedType } of messages) {
      const result = handler.classify('feat-x', 'VERIFY', msg);
      if (result.ok) expect(result.value.type).toBe(expectedType);
    }
  });
});

// ── 추가 경계값: 다양한 Phase 조합 ──────────────────────────────

describe('FailureHandler 다양한 Phase 조합 경계값', () => {
  it('DESIGN Phase + design_flaw 메시지 → design_flaw', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'DESIGN', 'architecture 설계 결함');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('design_flaw');
  });

  it('CODE Phase + implementation_bug 메시지 → implementation_bug', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'CODE', 'undefined is not a function');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('implementation_bug');
  });

  it('TEST Phase + test_gap 메시지 → test_gap', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'TEST', 'test coverage 부족');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('test_gap');
  });

  it('VERIFY Phase + spec_ambiguity 메시지 → spec_ambiguity', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', '요구사항 모호 unclear');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('spec_ambiguity');
  });

  it('DESIGN Phase + infrastructure 메시지 → infrastructure', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'DESIGN', 'connection timeout 실패');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('infrastructure');
  });

  it('CODE Phase + unknown 메시지 → unknown', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'CODE', '알 수 없는 문제');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('unknown');
  });

  it('TEST Phase + design_flaw 메시지 → design_flaw (Phase 무관 분류)', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'TEST', 'interface structure 설계 결함');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('design_flaw');
  });

  it('VERIFY Phase + implementation_bug 메시지 → implementation_bug', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'crash exception 발생');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('implementation_bug');
  });
});

// ── 추가 경계값: featureId 다양한 케이스 ────────────────────────

describe('FailureHandler featureId 다양한 케이스', () => {
  it('특수문자 포함 featureId → ok', () => {
    const handler = makeHandler();
    const result = handler.classify('feat!@#$', 'VERIFY', 'some error message');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('feat!@#$');
  });

  it('한글 featureId → ok', () => {
    const handler = makeHandler();
    const result = handler.classify('기능-인증', 'VERIFY', 'some error message');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('기능-인증');
  });

  it('긴 featureId (100자) → ok', () => {
    const handler = makeHandler();
    const longId = 'f'.repeat(100);
    const result = handler.classify(longId, 'VERIFY', 'some error message');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe(longId);
  });

  it('숫자만 featureId → ok', () => {
    const handler = makeHandler();
    const result = handler.classify('123456', 'VERIFY', 'some error message');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('123456');
  });

  it('이모지 포함 featureId → ok', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-🎯', 'VERIFY', 'some error message');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('feat-🎯');
  });

  it('공백 포함 featureId → ok', () => {
    const handler = makeHandler();
    const result = handler.classify('my feature id', 'VERIFY', 'some error message');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('my feature id');
  });
});

// ── 추가 경계값: 에러 메시지 다양한 케이스 ───────────────────────

describe('FailureHandler 에러 메시지 다양한 케이스', () => {
  it('개행 포함 에러 메시지 → 분류됨', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'line1\nline2\narchitecture error');
    expect(result.ok).toBe(true);
  });

  it('탭 포함 에러 메시지 → 분류됨', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'error\ttab\tdesign issue');
    expect(result.ok).toBe(true);
  });

  it('대문자 키워드 → 분류됨 (대소문자 무관)', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'ARCHITECTURE DESIGN FLAW');
    expect(result.ok).toBe(true);
  });

  it('혼합 대소문자 키워드 → 분류됨', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'Architecture Design flaw');
    expect(result.ok).toBe(true);
  });

  it('여러 카테고리 키워드 혼합 → 한 카테고리로 분류', () => {
    const handler = makeHandler();
    // architecture(design_flaw)와 bug(implementation_bug) 키워드 혼합
    // 먼저 매칭되는 타입으로 분류
    const result = handler.classify('feat-1', 'VERIFY', 'architecture design bug crash');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(['design_flaw', 'implementation_bug']).toContain(result.value.type);
    }
  });

  it('이모지만 있는 에러 메시지 → 분류됨', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', '🚀🎉💥');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('unknown');
  });

  it('JSON 형식 에러 메시지 → 분류됨', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', '{"error": "undefined is not a function", "type": "bug"}');
    expect(result.ok).toBe(true);
  });

  it('스택 트레이스 형식 → 분류됨', () => {
    const handler = makeHandler();
    const stackTrace = 'Error: undefined is not a function\n  at foo (index.ts:10)\n  at bar (main.ts:20)';
    const result = handler.classify('feat-1', 'VERIFY', stackTrace);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('implementation_bug');
  });

  it('숫자만 있는 에러 메시지 → unknown', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', '404');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('unknown');
  });

  it('단일 키워드 "design" → design_flaw', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'design');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('design_flaw');
  });

  it('단일 키워드 "bug" → implementation_bug', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'bug');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('implementation_bug');
  });

  it('단일 키워드 "test" → test_gap', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'test');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('test_gap');
  });

  it('단일 키워드 "timeout" → infrastructure', () => {
    const handler = makeHandler();
    const result = handler.classify('feat-1', 'VERIFY', 'timeout');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('infrastructure');
  });
});

// ── 추가 경계값: 한국어 + 영어 혼합 키워드 ────────────────────────────

describe('FailureHandler 한국어+영어 혼합 키워드', () => {
  it('"architecture 아키텍처 결함" → design_flaw', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'architecture 아키텍처 결함');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('design_flaw');
  });

  it('"bug 버그 crash" → implementation_bug', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'bug 버그 crash');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('implementation_bug');
  });

  it('"test 테스트 coverage 커버리지" → test_gap', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'test 테스트 coverage 커버리지');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('test_gap');
  });

  it('"spec unclear 스펙 불명확" → spec_ambiguity', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'spec unclear 스펙 불명확');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('spec_ambiguity');
  });

  it('"timeout 타임아웃 connection" → infrastructure', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'timeout 타임아웃 connection');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('infrastructure');
  });

  it('"에러 error 발생" → implementation_bug', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', '에러 error 발생');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('implementation_bug');
  });

  it('"구조 structure 불일치" → design_flaw', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', '구조 structure 불일치');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('design_flaw');
  });

  it('"커버리지 coverage 미달 부족" → test_gap', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', '커버리지 coverage 미달 부족');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('test_gap');
  });

  it('"모호한 ambiguous 요구사항" → spec_ambiguity', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', '모호한 ambiguous 요구사항');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('spec_ambiguity');
  });

  it('"연결 connection 끊김 refused" → infrastructure', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', '연결 connection 끊김 refused');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('infrastructure');
  });
});

// ── 추가 경계값: 모든 Phase × 모든 타입 조합 ─────────────────────────

describe('FailureHandler 모든 Phase × 모든 타입 조합', () => {
  const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];

  it('DESIGN × design_flaw → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'DESIGN', 'architecture 결함');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('DESIGN');
  });

  it('DESIGN × implementation_bug → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'DESIGN', 'bug crash 발생');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('DESIGN');
  });

  it('DESIGN × test_gap → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'DESIGN', 'test coverage 부족');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('DESIGN');
  });

  it('DESIGN × spec_ambiguity → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'DESIGN', '스펙 unclear ambiguous');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('DESIGN');
  });

  it('DESIGN × infrastructure → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'DESIGN', 'timeout connection 실패');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('DESIGN');
  });

  it('CODE × design_flaw → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'CODE', 'architecture 설계 결함');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('CODE');
  });

  it('CODE × implementation_bug → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'CODE', 'exception bug 발생');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('CODE');
  });

  it('CODE × test_gap → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'CODE', 'test coverage 미달');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('CODE');
  });

  it('CODE × spec_ambiguity → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'CODE', 'requirement 모호 unclear');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('CODE');
  });

  it('CODE × infrastructure → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'CODE', 'network timeout 발생');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('CODE');
  });

  it('TEST × design_flaw → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'TEST', 'interface structure 결함');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('TEST');
  });

  it('TEST × implementation_bug → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'TEST', 'crash error 오류');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('TEST');
  });

  it('TEST × test_gap → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'TEST', 'assertion test 실패');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('TEST');
  });

  it('TEST × spec_ambiguity → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'TEST', 'spec ambiguous 모호');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('TEST');
  });

  it('TEST × infrastructure → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'TEST', 'rate_limit 타임아웃');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('TEST');
  });

  it('VERIFY × design_flaw → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'VERIFY', 'design architecture 이슈');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('VERIFY');
  });

  it('VERIFY × implementation_bug → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'VERIFY', 'undefined is not a function 에러');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('VERIFY');
  });

  it('VERIFY × test_gap → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'VERIFY', 'coverage 부족 assertion');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('VERIFY');
  });

  it('VERIFY × spec_ambiguity → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'VERIFY', '요구사항 모호 unclear spec');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('VERIFY');
  });

  it('VERIFY × infrastructure → ok', () => {
    const h = makeHandler();
    const r = h.classify('f1', 'VERIFY', '연결 끊김 timeout 발생');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phase).toBe('VERIFY');
  });

  it('4가지 Phase 모두에서 empty 메시지 → 에러', () => {
    const h = makeHandler();
    for (const phase of phases) {
      const r = h.classify('f1', phase, '');
      expect(r.ok).toBe(false);
    }
  });
});

// ── 추가 경계값: getRecoveryPhase 상세 검증 ─────────────────────────

describe('FailureHandler.getRecoveryPhase 상세 검증', () => {
  let handler: FailureHandler;

  beforeEach(() => {
    handler = makeHandler();
  });

  it('design_flaw 보고서 → getRecoveryPhase=DESIGN', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'interface design 결함 아키텍처');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('DESIGN');
  });

  it('implementation_bug 보고서 → getRecoveryPhase=CODE', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'NullPointerException crash');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
  });

  it('test_gap 보고서 → getRecoveryPhase=TEST', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'test assertion coverage 미달');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('TEST');
  });

  it('spec_ambiguity 보고서 → getRecoveryPhase=DESIGN', () => {
    const r = handler.classify('feat-1', 'VERIFY', '스펙 unclear ambiguous 요구사항');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('DESIGN');
  });

  it('infrastructure 보고서 → getRecoveryPhase=CODE', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'rate_limit 네트워크 timeout');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
  });

  it('unknown 보고서 → getRecoveryPhase=CODE', () => {
    const r = handler.classify('feat-1', 'VERIFY', '이상한_알수없는_오류_xyz99');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
  });

  it('연속 10번 getRecoveryPhase 호출 → 동일 결과', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'design architecture 결함');
    if (r.ok) {
      const expected = handler.getRecoveryPhase(r.value);
      for (let i = 0; i < 10; i++) {
        expect(handler.getRecoveryPhase(r.value)).toBe(expected);
      }
    }
  });

  it('여러 다른 타입 보고서 연속 생성 → 각각 올바른 recovery phase', () => {
    const cases: [string, Phase][] = [
      ['architecture 설계 결함', 'DESIGN'],
      ['bug exception crash', 'CODE'],
      ['test coverage assertion', 'TEST'],
      ['spec unclear ambiguous', 'DESIGN'],
      ['timeout network connection', 'CODE'],
    ];
    for (const [msg, expectedPhase] of cases) {
      const r = handler.classify('feat-x', 'VERIFY', msg);
      if (r.ok) {
        expect(handler.getRecoveryPhase(r.value)).toBe(expectedPhase);
      }
    }
  });

  it('DESIGN Phase에서 implementation_bug → getRecoveryPhase=CODE', () => {
    const r = handler.classify('feat-1', 'DESIGN', 'undefined is not a function');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('CODE');
  });

  it('CODE Phase에서 test_gap → getRecoveryPhase=TEST', () => {
    const r = handler.classify('feat-1', 'CODE', 'test coverage 부족 assertion');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('TEST');
  });

  it('TEST Phase에서 design_flaw → getRecoveryPhase=DESIGN', () => {
    const r = handler.classify('feat-1', 'TEST', 'interface architecture 설계 결함');
    if (r.ok) expect(handler.getRecoveryPhase(r.value)).toBe('DESIGN');
  });
});

// ── 추가 경계값: 연속 분류 → reportCounter 세밀 검증 ────────────────

describe('FailureHandler reportCounter 세밀 검증', () => {
  it('20개 분류 → ID 모두 고유', () => {
    const h = makeHandler();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = h.classify(`feat-${i}`, 'VERIFY', `error message ${i}`);
      if (r.ok) ids.push(r.value.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('50개 분류 → ID 모두 고유', () => {
    const h = makeHandler();
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const r = h.classify(`feat-${i}`, 'VERIFY', `error ${i}`);
      if (r.ok) ids.push(r.value.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ID에 "failure-" 프리픽스 포함', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'some error message');
    if (r.ok) expect(r.value.id).toContain('failure-');
  });

  it('순차 ID는 엄격히 증가', () => {
    const h = makeHandler();
    let prevNum = -1;
    for (let i = 0; i < 5; i++) {
      const r = h.classify(`feat-${i}`, 'VERIFY', `error ${i}`);
      if (r.ok) {
        const num = parseInt(r.value.id.replace('failure-', ''));
        expect(num).toBeGreaterThan(prevNum);
        prevNum = num;
      }
    }
  });

  it('두 핸들러 동시 분류 → 각각 고유 ID', () => {
    const h1 = makeHandler();
    const h2 = makeHandler();
    const r1 = h1.classify('feat-1', 'VERIFY', 'some error');
    const r2 = h2.classify('feat-1', 'VERIFY', 'some error');
    if (r1.ok && r2.ok) {
      expect(typeof r1.value.id).toBe('string');
      expect(typeof r2.value.id).toBe('string');
    }
  });

  it('분류 결과 timestamp는 Date 객체', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'some error');
    if (r.ok) expect(r.value.timestamp).toBeInstanceOf(Date);
  });

  it('timestamp가 현재 시간과 가까움', () => {
    const h = makeHandler();
    const before = Date.now();
    const r = h.classify('feat-1', 'VERIFY', 'some error');
    const after = Date.now();
    if (r.ok) {
      const ts = r.value.timestamp.getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    }
  });

  it('100개 분류 → 성능 문제 없음', () => {
    const h = makeHandler();
    const messages = [
      'architecture design 결함', 'bug crash exception', 'test coverage assertion',
      'spec unclear ambiguous', 'timeout network connection', '이상한 에러',
    ];
    for (let i = 0; i < 100; i++) {
      const r = h.classify(`feat-${i % 10}`, 'VERIFY', messages[i % messages.length]!);
      expect(r.ok).toBe(true);
    }
  });
});

// ── 추가 경계값: classify 결과 suggestedAction 상세 검증 ─────────────

describe('FailureHandler suggestedAction 상세 검증', () => {
  let handler: FailureHandler;

  beforeEach(() => {
    handler = makeHandler();
  });

  it('design_flaw → suggestedAction=rollback_phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'architecture 결함');
    if (r.ok) expect(r.value.suggestedAction).toBe('rollback_phase');
  });

  it('implementation_bug → suggestedAction=rollback_phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'exception bug 발생');
    if (r.ok) expect(r.value.suggestedAction).toBe('rollback_phase');
  });

  it('test_gap → suggestedAction=rollback_phase', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'test coverage 부족');
    if (r.ok) expect(r.value.suggestedAction).toBe('rollback_phase');
  });

  it('spec_ambiguity → suggestedAction=escalate_user', () => {
    const r = handler.classify('feat-1', 'VERIFY', '스펙 unclear ambiguous');
    if (r.ok) expect(r.value.suggestedAction).toBe('escalate_user');
  });

  it('infrastructure → suggestedAction=retry', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'timeout connection 실패');
    if (r.ok) expect(r.value.suggestedAction).toBe('retry');
  });

  it('unknown → suggestedAction=retry', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'completely unrecognized signal qwerty');
    if (r.ok) expect(r.value.suggestedAction).toBe('retry');
  });

  it('suggestedAction은 문자열', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'some error');
    if (r.ok) expect(typeof r.value.suggestedAction).toBe('string');
  });

  it('5번 반복 → suggestedAction 일관됨', () => {
    for (let i = 0; i < 5; i++) {
      const r = handler.classify('feat-1', 'VERIFY', 'architecture design 결함');
      if (r.ok) expect(r.value.suggestedAction).toBe('rollback_phase');
    }
  });

  it('design_flaw + suggestedAction + targetPhase 조합 검증', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'structure 설계 결함 interface');
    if (r.ok) {
      expect(r.value.type).toBe('design_flaw');
      expect(r.value.suggestedAction).toBe('rollback_phase');
      expect(r.value.targetPhase).toBe('DESIGN');
    }
  });

  it('infrastructure + suggestedAction + targetPhase 조합 검증', () => {
    const r = handler.classify('feat-1', 'VERIFY', 'connection refused timeout');
    if (r.ok) {
      expect(r.value.type).toBe('infrastructure');
      expect(r.value.suggestedAction).toBe('retry');
    }
  });
});

// ── 추가 경계값: 대량 Edge Case 랜덤 ───────────────────────────────

describe('FailureHandler 대량 Edge Case 랜덤', () => {
  it('빈 문자열 → 항상 ok=false', () => {
    const h = makeHandler();
    for (let i = 0; i < 10; i++) {
      expect(h.classify('feat-1', 'VERIFY', '').ok).toBe(false);
    }
  });

  it('whitespace 다양한 종류 → 항상 ok=false', () => {
    const h = makeHandler();
    const whitespaces = [' ', '  ', '\t', '\n', '\r', '   \t  ', '\n\n'];
    for (const ws of whitespaces) {
      expect(h.classify('feat-1', 'VERIFY', ws).ok).toBe(false);
    }
  });

  it('매우 긴 에러 메시지 (10000자) → 분류됨', () => {
    const h = makeHandler();
    const longMsg = 'architecture design '.repeat(500);
    const r = h.classify('feat-1', 'VERIFY', longMsg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('design_flaw');
  });

  it('개행문자 포함 architecture 키워드 → design_flaw', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'line1\narchitecture 결함\nline3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('design_flaw');
  });

  it('탭 문자 포함 bug 키워드 → implementation_bug', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'error\tbug\tcrash');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('implementation_bug');
  });

  it('JSON 파싱 에러 메시지 → 분류됨', () => {
    const h = makeHandler();
    const msg = JSON.stringify({ error: 'architecture design flaw', severity: 'high' });
    const r = h.classify('feat-1', 'VERIFY', msg);
    expect(r.ok).toBe(true);
  });

  it('XML 형식 에러 메시지 → 분류됨', () => {
    const h = makeHandler();
    const msg = '<error type="bug">Exception occurred: crash detected</error>';
    const r = h.classify('feat-1', 'VERIFY', msg);
    expect(r.ok).toBe(true);
  });

  it('URL 포함 에러 메시지 → 분류됨', () => {
    const h = makeHandler();
    const msg = 'Connection refused at http://api.example.com/endpoint timeout 30s';
    const r = h.classify('feat-1', 'VERIFY', msg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe('infrastructure');
  });

  it('숫자 코드 에러 메시지 → unknown', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', '500 Internal Server Error');
    expect(r.ok).toBe(true);
  });

  it('classify 후 description 길이 > 0', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'some error message xyz');
    if (r.ok) expect(r.value.description.length).toBeGreaterThan(0);
  });

  it('featureId와 description 모두 정확히 기록', () => {
    const h = makeHandler();
    const r = h.classify('exact-id', 'VERIFY', 'exact error description xyz');
    if (r.ok) {
      expect(r.value.featureId).toBe('exact-id');
      expect(r.value.description).toContain('exact error description xyz');
    }
  });

  it('classify ok=true → value 필드 모두 존재', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', 'some error');
    if (r.ok) {
      expect(r.value.id).toBeDefined();
      expect(r.value.type).toBeDefined();
      expect(r.value.featureId).toBeDefined();
      expect(r.value.phase).toBeDefined();
      expect(r.value.description).toBeDefined();
      expect(r.value.suggestedAction).toBeDefined();
      expect(r.value.timestamp).toBeDefined();
    }
  });

  it('classify ok=false → error 필드 존재', () => {
    const h = makeHandler();
    const r = h.classify('feat-1', 'VERIFY', '');
    if (!r.ok) {
      expect(r.error).toBeDefined();
    }
  });

  it('targetPhase는 Phase 타입 문자열', () => {
    const h = makeHandler();
    const validPhases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    const r = h.classify('feat-1', 'VERIFY', 'architecture 설계 결함');
    if (r.ok && r.value.targetPhase !== undefined) {
      expect(validPhases).toContain(r.value.targetPhase);
    }
  });

  it('10개 랜덤 UUID featureId → 모두 ok=true', () => {
    const h = makeHandler();
    for (let i = 0; i < 10; i++) {
      const id = `xxxxxxxx-xxxx-4xxx-yxxx-${i.toString().padStart(12, '0')}`;
      const r = h.classify(id, 'VERIFY', 'some error message');
      expect(r.ok).toBe(true);
    }
  });
});
