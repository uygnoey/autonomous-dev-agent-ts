/**
 * BugEscalator 단위 테스트 / BugEscalator unit tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { BugEscalator } from '../../../src/layer3/bug-escalator.js';
import type { TestFailure } from '../../../src/layer3/types.js';

describe('BugEscalator', () => {
  let escalator: BugEscalator;

  const createFailure = (overrides?: Partial<TestFailure>): TestFailure => ({
    testName: 'test-login',
    error: 'assertion failed',
    featureId: 'feat-1',
    ...overrides,
  });

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    escalator = new BugEscalator(logger);
  });

  describe('createReport / 버그 리포트 생성', () => {
    it('테스트 실패에서 버그 리포트를 생성한다', () => {
      const failure = createFailure({ error: 'unexpected error in auth' });
      const result = escalator.createReport('proj-1', failure);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-1');
        expect(result.value.featureId).toBe('feat-1');
        expect(result.value.description).toContain('test-login');
        expect(result.value.description).toContain('unexpected error in auth');
        expect(result.value.severity).toBeTruthy();
      }
    });

    it('critical 키워드를 critical로 분류한다', () => {
      const failure = createFailure({ error: 'fatal crash in payment module' });
      const result = escalator.createReport('proj-1', failure);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.severity).toBe('critical');
      }
    });

    it('security 키워드를 critical로 분류한다', () => {
      const failure = createFailure({ error: 'SQL injection vulnerability detected' });
      const result = escalator.createReport('proj-1', failure);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.severity).toBe('critical');
      }
    });

    it('major severity 키워드를 major로 분류한다', () => {
      const failure = createFailure({ error: 'timeout exception during API call' });
      const result = escalator.createReport('proj-1', failure);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.severity).toBe('major');
      }
    });

    it('분류 불가 에러를 low로 분류한다', () => {
      const failure = createFailure({ error: 'something unexpected happened' });
      const result = escalator.createReport('proj-1', failure);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.severity).toBe('low');
      }
    });

    it('빈 프로젝트 ID는 에러를 반환한다', () => {
      const result = escalator.createReport('', createFailure());
      expect(result.ok).toBe(false);
    });

    it('공백만 있는 프로젝트 ID는 에러를 반환한다', () => {
      const result = escalator.createReport('   ', createFailure());
      expect(result.ok).toBe(false);
    });

    it('빈 에러 메시지는 에러를 반환한다', () => {
      const failure = createFailure({ error: '' });
      const result = escalator.createReport('proj-1', failure);
      expect(result.ok).toBe(false);
    });

    it('공백만 있는 에러 메시지는 에러를 반환한다', () => {
      const failure = createFailure({ error: '   ' });
      const result = escalator.createReport('proj-1', failure);
      expect(result.ok).toBe(false);
    });

    it('고유한 리포트 ID를 생성한다', () => {
      const r1 = escalator.createReport('proj-1', createFailure({ error: 'error one' }));
      const r2 = escalator.createReport('proj-1', createFailure({ error: 'error two' }));
      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });
  });

  describe('escalate / 에스컬레이션', () => {
    it('critical → CODE Phase로 에스컬레이션한다', () => {
      const failure = createFailure({ error: 'fatal crash' });
      const reportResult = escalator.createReport('proj-1', failure);
      if (!reportResult.ok) return;

      const result = escalator.escalate(reportResult.value);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.targetPhase).toBe('CODE');
      }
    });

    it('major → TEST Phase로 에스컬레이션한다', () => {
      const failure = createFailure({ error: 'timeout exception' });
      const reportResult = escalator.createReport('proj-1', failure);
      if (!reportResult.ok) return;

      const result = escalator.escalate(reportResult.value);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.targetPhase).toBe('TEST');
      }
    });

    it('minor → VERIFY Phase로 에스컬레이션한다', () => {
      const failure = createFailure({ error: 'minor styling issue' });
      const reportResult = escalator.createReport('proj-1', failure);
      if (!reportResult.ok) return;

      const result = escalator.escalate(reportResult.value);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.targetPhase).toBe('VERIFY');
      }
    });
  });

  describe('getActiveReports / 활성 리포트 조회', () => {
    it('프로젝트별 활성 리포트를 반환한다', () => {
      escalator.createReport('proj-1', createFailure({ error: 'error A' }));
      escalator.createReport('proj-2', createFailure({ error: 'error B' }));
      escalator.createReport('proj-1', createFailure({ error: 'error C' }));

      const proj1Reports = escalator.getActiveReports('proj-1');
      expect(proj1Reports).toHaveLength(2);

      const proj2Reports = escalator.getActiveReports('proj-2');
      expect(proj2Reports).toHaveLength(1);
    });

    it('리포트가 없으면 빈 배열을 반환한다', () => {
      expect(escalator.getActiveReports('proj-999')).toHaveLength(0);
    });
  });

  describe('resolveReport / 리포트 해결', () => {
    it('활성 리포트를 해결한다', () => {
      const reportResult = escalator.createReport('proj-1', createFailure({ error: 'error A' }));
      if (!reportResult.ok) return;

      const resolveResult = escalator.resolveReport(reportResult.value.id);
      expect(resolveResult.ok).toBe(true);

      // WHY: 해결 후 활성 목록에서 제거되었는지 확인
      expect(escalator.getActiveReports('proj-1')).toHaveLength(0);
    });

    it('존재하지 않는 리포트 해결은 에러를 반환한다', () => {
      const result = escalator.resolveReport('nonexistent-id');
      expect(result.ok).toBe(false);
    });

    it('이미 해결된 리포트 재해결은 에러를 반환한다', () => {
      const reportResult = escalator.createReport('proj-1', createFailure({ error: 'error A' }));
      if (!reportResult.ok) return;

      escalator.resolveReport(reportResult.value.id);
      const secondResolve = escalator.resolveReport(reportResult.value.id);
      expect(secondResolve.ok).toBe(false);
    });
  });
});
