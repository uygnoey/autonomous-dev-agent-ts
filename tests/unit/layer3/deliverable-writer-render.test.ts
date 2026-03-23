/**
 * DeliverableWriterRender 단위 테스트 / Deliverable markdown render unit tests
 *
 * @description
 * KR: renderPortfolio, renderBusinessPlan, renderInvestmentProposal,
 *     renderPresentation, renderDeliverableMarkdown 순수 함수 테스트.
 * EN: Tests for deliverable markdown rendering functions. 80%+ edge/error ratio.
 */

import { describe, expect, it } from 'bun:test';
import type { DeliverableMetadata } from 'layer3/deliverable-types.js';
import {
  renderBusinessPlan,
  renderDeliverableMarkdown,
  renderInvestmentProposal,
  renderPortfolio,
  renderPresentation,
} from 'layer3/deliverable-writer-render.js';

function makeMetadata(overrides?: Partial<DeliverableMetadata>): DeliverableMetadata {
  return {
    projectName: 'TestProject',
    projectDescription: 'A test project description.',
    ...overrides,
  };
}

// ── renderPortfolio ───────────────────────────────────────────

describe('renderPortfolio', () => {
  it('프로젝트 이름이 제목에 포함된다', () => {
    const md = renderPortfolio(makeMetadata());
    expect(md).toContain('# TestProject Portfolio');
  });

  it('프로젝트 설명이 포함된다', () => {
    const md = renderPortfolio(makeMetadata());
    expect(md).toContain('A test project description.');
  });

  it('targetAudience가 있으면 포함된다', () => {
    const md = renderPortfolio(makeMetadata({ targetAudience: 'Developers' }));
    expect(md).toContain('Developers');
    expect(md).toContain('Target Audience');
  });

  it('targetAudience가 없으면 해당 섹션이 없다', () => {
    const md = renderPortfolio(makeMetadata());
    expect(md).not.toContain('Target Audience');
  });

  it('purpose가 있으면 포함된다', () => {
    const md = renderPortfolio(makeMetadata({ purpose: 'Showcase skills' }));
    expect(md).toContain('Showcase skills');
    expect(md).toContain('Purpose');
  });

  it('extra 메타데이터가 포함된다', () => {
    const md = renderPortfolio(makeMetadata({ extra: { version: '1.0', team: 'Alpha' } }));
    expect(md).toContain('**version**');
    expect(md).toContain('1.0');
    expect(md).toContain('**team**');
  });

  it('빈 extra는 추가 섹션을 생성하지 않는다', () => {
    const md = renderPortfolio(makeMetadata({ extra: {} }));
    // WHY: 빈 객체면 entries()가 비어서 heading만 나오되 항목이 없음
    expect(md).toContain('Additional Details');
  });

  it('Generated at 타임스탬프가 포함된다', () => {
    const md = renderPortfolio(makeMetadata());
    expect(md).toContain('Generated at');
  });
});

// ── renderBusinessPlan ────────────────────────────────────────

describe('renderBusinessPlan', () => {
  it('Business Plan 제목이 포함된다', () => {
    const md = renderBusinessPlan(makeMetadata());
    expect(md).toContain('# Business Plan — TestProject');
  });

  it('Executive Summary 섹션이 포함된다', () => {
    const md = renderBusinessPlan(makeMetadata());
    expect(md).toContain('Executive Summary');
  });

  it('targetAudience가 있으면 Target Market 섹션이 생긴다', () => {
    const md = renderBusinessPlan(makeMetadata({ targetAudience: 'SMBs' }));
    expect(md).toContain('Target Market');
    expect(md).toContain('SMBs');
  });

  it('purpose가 있으면 Objectives 섹션이 생긴다', () => {
    const md = renderBusinessPlan(makeMetadata({ purpose: 'Revenue growth' }));
    expect(md).toContain('Objectives');
    expect(md).toContain('Revenue growth');
  });
});

// ── renderInvestmentProposal ──────────────────────────────────

describe('renderInvestmentProposal', () => {
  it('Investment Proposal 제목이 포함된다', () => {
    const md = renderInvestmentProposal(makeMetadata());
    expect(md).toContain('# Investment Proposal — TestProject');
  });

  it('targetAudience가 있으면 Target Investors 섹션이 생긴다', () => {
    const md = renderInvestmentProposal(makeMetadata({ targetAudience: 'VCs' }));
    expect(md).toContain('Target Investors');
  });

  it('purpose가 있으면 Investment Purpose 섹션이 생긴다', () => {
    const md = renderInvestmentProposal(makeMetadata({ purpose: 'Series A' }));
    expect(md).toContain('Investment Purpose');
  });
});

// ── renderPresentation ────────────────────────────────────────

describe('renderPresentation', () => {
  it('프로젝트 이름이 최상위 제목이다', () => {
    const md = renderPresentation(makeMetadata());
    expect(md.startsWith('# TestProject')).toBe(true);
  });

  it('Introduction 섹션이 포함된다', () => {
    const md = renderPresentation(makeMetadata());
    expect(md).toContain('Introduction');
  });

  it('targetAudience가 있으면 Audience 섹션이 생긴다', () => {
    const md = renderPresentation(makeMetadata({ targetAudience: 'Executives' }));
    expect(md).toContain('Audience');
  });

  it('슬라이드 구분선(---)이 포함된다', () => {
    const md = renderPresentation(makeMetadata());
    expect(md).toContain('---');
  });
});

// ── renderDeliverableMarkdown (dispatch) ──────────────────────

describe('renderDeliverableMarkdown', () => {
  it('portfolio 타입 시 포트폴리오 형식을 반환한다', () => {
    const md = renderDeliverableMarkdown('portfolio', makeMetadata());
    expect(md).toContain('Portfolio');
  });

  it('business-plan 타입 시 사업계획서 형식을 반환한다', () => {
    const md = renderDeliverableMarkdown('business-plan', makeMetadata());
    expect(md).toContain('Business Plan');
  });

  it('investment-proposal 타입 시 투자제안서 형식을 반환한다', () => {
    const md = renderDeliverableMarkdown('investment-proposal', makeMetadata());
    expect(md).toContain('Investment Proposal');
  });

  it('presentation 타입 시 프레젠테이션 형식을 반환한다', () => {
    const md = renderDeliverableMarkdown('presentation', makeMetadata());
    expect(md).toContain('Introduction');
  });

  it('모든 타입에서 프로젝트 설명이 포함된다', () => {
    const types = ['portfolio', 'business-plan', 'investment-proposal', 'presentation'] as const;
    for (const type of types) {
      const md = renderDeliverableMarkdown(type, makeMetadata());
      expect(md).toContain('A test project description.');
    }
  });
});
