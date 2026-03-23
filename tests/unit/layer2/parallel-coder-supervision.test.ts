/**
 * NI-003: parallel-coder-supervision 감독 결과 분석 테스트
 *
 * @description
 * KR: architect/reviewer 감독 세션에서 합격/불합격 판정 + 키워드 분석을 검증한다.
 * EN: Validates pass/fail verdict from architect/reviewer supervision and keyword analysis.
 */

import { describe, expect, it } from 'bun:test';
import type { AgentEvent } from 'layer2/types.js';
import {
  analyzeSupervisionOutput,
  type SupervisionVerdict,
} from 'layer2/parallel-coder-supervision.js';

// ── 헬퍼 / Helpers ──────────────────────────────────────────────

function makeMessageEvent(
  agentName: 'architect' | 'reviewer',
  content: string,
): AgentEvent {
  return {
    type: 'message',
    agentName,
    content,
    timestamp: new Date(),
  };
}

function makeDoneEvent(
  agentName: 'architect' | 'reviewer',
  content: string,
): AgentEvent {
  return {
    type: 'done',
    agentName,
    content,
    timestamp: new Date(),
  };
}

// ── analyzeSupervisionOutput 테스트 ─────────────────────────────

describe('analyzeSupervisionOutput', () => {
  // ── 합격 케이스 ─────────────────────────────────────────────

  it('PASS 키워드 포함 → 합격', () => {
    const events = [
      makeMessageEvent('architect', '코드가 스펙을 준수합니다. PASS'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(true);
    expect(result.agentName).toBe('architect');
  });

  it('APPROVE 키워드 포함 → 합격', () => {
    const events = [
      makeMessageEvent('reviewer', 'Code quality is good. APPROVE'),
    ];
    const result = analyzeSupervisionOutput('reviewer', events);
    expect(result.passed).toBe(true);
  });

  it('LGTM 키워드 포함 → 합격', () => {
    const events = [
      makeMessageEvent('architect', 'LGTM - 설계 준수 확인'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(true);
  });

  it('합격 한국어 키워드 포함 → 합격', () => {
    const events = [
      makeMessageEvent('reviewer', '코드 품질 합격'),
    ];
    const result = analyzeSupervisionOutput('reviewer', events);
    expect(result.passed).toBe(true);
  });

  it('승인 키워드 포함 → 합격', () => {
    const events = [
      makeMessageEvent('architect', '설계 승인합니다'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(true);
  });

  // ── 불합격 케이스 ───────────────────────────────────────────

  it('FAIL 키워드 포함 → 불합격', () => {
    const events = [
      makeMessageEvent('architect', 'FAIL: 스펙 위반 발견'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(false);
    expect(result.feedback).toContain('스펙 위반');
  });

  it('REJECT 키워드 포함 → 불합격', () => {
    const events = [
      makeMessageEvent('reviewer', 'REJECT: 코드 품질 미달'),
    ];
    const result = analyzeSupervisionOutput('reviewer', events);
    expect(result.passed).toBe(false);
  });

  it('불합격 한국어 키워드 포함 → 불합격', () => {
    const events = [
      makeMessageEvent('architect', '설계 불합격 — SOLID 위반'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(false);
  });

  it('재작업 키워드 포함 → 불합격', () => {
    const events = [
      makeMessageEvent('reviewer', '재작업 필요: 에러 처리 누락'),
    ];
    const result = analyzeSupervisionOutput('reviewer', events);
    expect(result.passed).toBe(false);
  });

  it('REWORK 키워드 포함 → 불합격', () => {
    const events = [
      makeMessageEvent('architect', 'REWORK needed: missing interface'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(false);
  });

  // ── 불합격이 합격보다 우선 ──────────────────────────────────

  it('PASS와 FAIL 동시 포함 → 불합격 (FAIL 우선)', () => {
    const events = [
      makeMessageEvent('architect', 'Some parts PASS but overall FAIL'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(false);
  });

  // ── 키워드 없는 경우 ────────────────────────────────────────

  it('판정 키워드 없음 → 기본 합격', () => {
    const events = [
      makeMessageEvent('architect', '코드를 검토했습니다. 특별한 문제 없습니다.'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(true);
    expect(result.feedback).toContain('명시적 판정 없음');
  });

  it('이벤트 없음 → 기본 합격', () => {
    const result = analyzeSupervisionOutput('reviewer', []);
    expect(result.passed).toBe(true);
  });

  // ── done 이벤트도 분석 대상 ─────────────────────────────────

  it('done 이벤트에 FAIL 키워드 → 불합격', () => {
    const events = [
      makeMessageEvent('architect', '검토 진행 중...'),
      makeDoneEvent('architect', 'FAIL: 의존성 누락'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(false);
  });

  it('done 이벤트에 PASS 키워드 → 합격', () => {
    const events = [
      makeMessageEvent('reviewer', '검토 진행 중...'),
      makeDoneEvent('reviewer', 'PASS: 코드 품질 양호'),
    ];
    const result = analyzeSupervisionOutput('reviewer', events);
    expect(result.passed).toBe(true);
  });

  // ── 대소문자 무관 ────────────────────────────────────────────

  it('소문자 fail → 불합격', () => {
    const events = [
      makeMessageEvent('architect', 'fail: lowercase detection'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(false);
  });

  it('소문자 pass → 합격', () => {
    const events = [
      makeMessageEvent('reviewer', 'pass: lowercase detection'),
    ];
    const result = analyzeSupervisionOutput('reviewer', events);
    expect(result.passed).toBe(true);
  });

  // ── 피드백 내용 검증 ────────────────────────────────────────

  it('불합격 시 마지막 message 이벤트가 피드백', () => {
    const events = [
      makeMessageEvent('architect', '첫 번째 리뷰 의견'),
      makeMessageEvent('architect', 'FAIL: 최종 거부 사유'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(false);
    expect(result.feedback).toContain('최종 거부 사유');
  });

  it('불합격 시 다른 에이전트의 message는 피드백에 미포함', () => {
    const events: AgentEvent[] = [
      makeMessageEvent('architect', 'FAIL: architect 거부'),
      { type: 'message', agentName: 'coder', content: 'coder의 메시지', timestamp: new Date() },
    ];
    const result = analyzeSupervisionOutput('architect', events);
    expect(result.passed).toBe(false);
    expect(result.feedback).toContain('architect 거부');
  });

  // ── tool_use 이벤트는 판정에 영향 없음 ──────────────────────

  it('tool_use 이벤트는 판정 분석에 사용되지 않음', () => {
    const events: AgentEvent[] = [
      { type: 'tool_use', agentName: 'architect', content: 'Tool: Read FAIL', timestamp: new Date() },
      makeMessageEvent('architect', '코드 검토 완료'),
    ];
    const result = analyzeSupervisionOutput('architect', events);
    // WHY: tool_use의 'FAIL'은 무시되어야 함 — message/done만 분석
    expect(result.passed).toBe(true);
  });
});
