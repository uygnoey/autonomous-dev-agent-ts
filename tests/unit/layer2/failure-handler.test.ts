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
});

// ── classify — 실패 유형 분류 ─────────────────────────────────

describe('FailureHandler.classify', () => {
  let handler: FailureHandler;

  beforeEach(() => {
    handler = makeHandler();
  });

  // design_flaw 분류
  describe('design_flaw 키워드', () => {
    it.each([
      'architecture 설계 결함 발견',
      'design pattern 문제',
      'structure가 잘못되었습니다',
      'interface 정의 오류',
      '설계가 잘못되었습니다',
      '구조 문제 발생',
      '인터페이스 불일치',
      'Architecture mismatch detected',
    ])('"%s" → design_flaw', (msg) => {
      const result = handler.classify('feat-1', 'VERIFY', msg);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('design_flaw');
        expect(result.value.targetPhase).toBe('DESIGN');
        expect(result.value.suggestedAction).toBe('rollback_phase');
      }
    });
  });

  // implementation_bug 분류
  describe('implementation_bug 키워드', () => {
    it.each([
      'undefined is not a function bug',
      'NullPointerException error',
      'exception 발생',
      'crash detected',
      'undefined variable 참조',
      '버그 발견',
      '에러 발생',
      '오류가 있습니다',
      'TypeError: Cannot read properties',
    ])('"%s" → implementation_bug', (msg) => {
      const result = handler.classify('feat-1', 'VERIFY', msg);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('implementation_bug');
        expect(result.value.targetPhase).toBe('CODE');
        expect(result.value.suggestedAction).toBe('rollback_phase');
      }
    });
  });

  // test_gap 분류
  describe('test_gap 키워드', () => {
    it.each([
      'test coverage 부족',
      'assertion failed',
      'expect() 실패',
      'coverage 미달',
      '테스트 실패',
      '커버리지 부족',
      'Test suite incomplete',
      'assertion failed in suite',
    ])('"%s" → test_gap', (msg) => {
      const result = handler.classify('feat-1', 'VERIFY', msg);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('test_gap');
        expect(result.value.targetPhase).toBe('TEST');
        expect(result.value.suggestedAction).toBe('rollback_phase');
      }
    });
  });

  // spec_ambiguity 분류
  describe('spec_ambiguity 키워드', () => {
    it.each([
      '요구사항이 unclear하고 ambiguous함',
      'spec이 불명확합니다',
      'requirement가 모호합니다',
      'unclear requirements',
      'ambiguous specification',
      '스펙이 불명확',
      '요구사항 모호',
      '모호한 스펙',
    ])('"%s" → spec_ambiguity', (msg) => {
      const result = handler.classify('feat-1', 'VERIFY', msg);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('spec_ambiguity');
        expect(result.value.suggestedAction).toBe('escalate_user');
      }
    });
  });

  // infrastructure 분류
  describe('infrastructure 키워드', () => {
    it.each([
      'timeout connection 실패',
      'connection refused',
      'network failure',
      'rate_limit 초과',
      '타임아웃 발생',
      '네트워크 오작동',
      '연결 끊김',
      'Connection timeout',
      'Network unreachable',
    ])('"%s" → infrastructure', (msg) => {
      const result = handler.classify('feat-1', 'VERIFY', msg);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('infrastructure');
        expect(result.value.suggestedAction).toBe('retry');
      }
    });
  });

  // unknown 분류
  describe('unknown 분류', () => {
    it.each([
      '알 수 없는 문제',
      '무언가 잘못됨',
      '문제 발생',
      'something went wrong',
      'mysterious failure occurred',
      'zzz',
      'xyz123',
      '🚀 failure',
    ])('"%s" → unknown', (msg) => {
      const result = handler.classify('feat-1', 'VERIFY', msg);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('unknown');
        expect(result.value.suggestedAction).toBe('retry');
      }
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
  });

  // 모든 Phase에서 분류
  describe('다양한 Phase에서 분류', () => {
    it.each(['DESIGN', 'CODE', 'TEST', 'VERIFY'] as Phase[])(
      'Phase %s에서 분류 가능',
      (phase) => {
        const result = handler.classify('feat-1', phase, 'some error message');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.phase).toBe(phase);
        }
      },
    );
  });

  // 랜덤 에러 메시지
  describe('랜덤 에러 메시지', () => {
    it.each(Array.from({ length: 30 }, (_, i) => i))(
      '랜덤 메시지 분류 #%i',
      (i) => {
        const messages = [
          `bug #${i}: something failed`,
          `design issue ${i}: structure problem`,
          `test failure #${i}: coverage missing`,
          `spec unclear ${i}: ambiguous requirement`,
          `timeout #${i}: connection failed`,
          `unknown error #${i}: mysterious`,
        ];
        const msg = messages[i % messages.length]!;
        const result = handler.classify(`feat-${i}`, 'VERIFY', msg);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(typeof result.value.type).toBe('string');
          expect(typeof result.value.id).toBe('string');
        }
      },
    );
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

  it.each([
    ['design architecture error', 'DESIGN'],
    ['implementation bug crash', 'CODE'],
    ['test coverage assertion', 'TEST'],
    ['timeout network error', 'CODE'],
    ['unclear ambiguous spec', 'DESIGN'],
    ['unknown mysterious', 'CODE'],
  ])('"%s" → %s Phase', (msg, expectedPhase) => {
    const r = handler.classify('feat-1', 'VERIFY', msg);
    if (r.ok) {
      expect(handler.getRecoveryPhase(r.value)).toBe(expectedPhase);
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

  it.each(Array.from({ length: 10 }, (_, i) => i + 1))(
    '%i번 분류 후 ID가 고유',
    (count) => {
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const r = handler.classify(`feat-${i}`, 'VERIFY', `error ${i} xyz`);
        if (r.ok) {
          ids.push(r.value.id);
        }
      }
      expect(new Set(ids).size).toBe(ids.length);
    },
  );
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
});
