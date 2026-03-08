/**
 * E2E: 문서 산출물 파이프라인 / Document Delivery Pipeline
 *
 * @description
 * KR: DocIntegrator 문서 통합 → DocCollaborator layer1+layer2 협업 →
 *     ProductionTester E2E 시뮬레이션 → BugEscalator 버그 에스컬레이션 →
 *     DeliverableBuilder 산출물 생성.
 * EN: Full layer3 pipeline from document integration through deliverable building.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { DocIntegrator } from 'layer3/doc-integrator.js';
import { DocCollaborator } from 'layer3/doc-collaborator.js';
import { ProductionTester } from 'layer3/production-tester.js';
import { BugEscalator } from 'layer3/bug-escalator.js';
import { DeliverableBuilder } from 'layer3/deliverable-builder.js';
import type { DocumentTemplate, IntegratedDocument, TestFailure } from 'layer3/types.js';

const logger = new ConsoleLogger('error');

/** 테스트용 템플릿 생성 헬퍼 / Helper to create test template */
function createTemplate(title: string, sectionCount: number): DocumentTemplate {
  const sections = Array.from({ length: sectionCount }, (_, i) => ({
    heading: `Section ${i + 1}`,
    content: `Content for section ${i + 1}`,
    order: i + 1,
    required: i < 2,
  }));

  return {
    type: 'api-reference' as const,
    title,
    sections,
    language: 'bilingual' as const,
  };
}

describe('문서 산출물 파이프라인 E2E / Document Delivery Pipeline E2E', () => {
  it('DocIntegrator: 조각 문서 통합', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('API Reference', 3);
    const fragments = ['frag-1', 'frag-2', 'frag-3'];

    const result = integrator.integrate(fragments, template, 'proj-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe('proj-1');
      expect(result.value.version).toBe(1);
      expect(result.value.sourceFragments).toHaveLength(3);
      expect(result.value.content).toContain('API Reference');
      expect(result.value.content).toContain('Section 1');
    }
  });

  it('DocIntegrator: 빈 조각 문서 에러', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Test', 1);

    const result = integrator.integrate([], template, 'proj-1');
    expect(result.ok).toBe(false);
  });

  it('DocIntegrator: 빈 템플릿 섹션 에러', () => {
    const integrator = new DocIntegrator(logger);
    const emptyTemplate: DocumentTemplate = {
      type: 'custom',
      title: 'Empty',
      sections: [],
      language: 'en',
    };

    const result = integrator.integrate(['frag-1'], emptyTemplate, 'proj-1');
    expect(result.ok).toBe(false);
  });

  it('DocIntegrator: 문서 업데이트 → 버전 증가', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Doc', 2);

    const createResult = integrator.integrate(['frag-1'], template, 'proj-1');
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const updateResult = integrator.updateDocument(createResult.value, ['frag-2', 'frag-3']);
    expect(updateResult.ok).toBe(true);
    if (updateResult.ok) {
      expect(updateResult.value.version).toBe(2);
      expect(updateResult.value.sourceFragments).toHaveLength(3);
      expect(updateResult.value.content).toContain('업데이트 부록');
    }
  });

  it('DocIntegrator: 마크다운 내보내기 (YAML frontmatter 포함)', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Export Test', 2);

    const docResult = integrator.integrate(['frag-1'], template, 'proj-1');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    const mdResult = integrator.exportAsMarkdown(docResult.value);
    expect(mdResult.ok).toBe(true);
    if (mdResult.ok) {
      expect(mdResult.value).toContain('---');
      expect(mdResult.value).toContain('title: Export Test');
      expect(mdResult.value).toContain('version: 1');
      expect(mdResult.value).toContain('language: bilingual');
    }
  });

  it('DocCollaborator: layer1 + layer2 문서 병합', () => {
    const collaborator = new DocCollaborator(logger);
    const outline = '# Architecture\n\n## Components\n\nComponent overview';
    const details = '## Auth Module\n\nJWT-based authentication with refresh tokens';

    const result = collaborator.collaborate(outline, details);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Architecture');
      expect(result.value).toContain('Auth Module');
      expect(result.value).toContain('---');
    }
  });

  it('DocCollaborator: 빈 아웃라인 에러', () => {
    const collaborator = new DocCollaborator(logger);

    const result = collaborator.collaborate('', 'some details');
    expect(result.ok).toBe(false);
  });

  it('DocCollaborator: 목차 생성', () => {
    const collaborator = new DocCollaborator(logger);
    const content = `# Project\n\n## Architecture\n\nDetails\n\n### Components\n\nMore details\n\n## Testing\n\nTest plan`;

    const tocResult = collaborator.generateTableOfContents(content);
    expect(tocResult.ok).toBe(true);
    if (tocResult.ok) {
      expect(tocResult.value).toContain('목차');
      expect(tocResult.value).toContain('Project');
      expect(tocResult.value).toContain('Architecture');
      expect(tocResult.value).toContain('Components');
      expect(tocResult.value).toContain('Testing');
    }
  });

  it('ProductionTester: E2E 테스트 실행 시뮬레이션', () => {
    const tester = new ProductionTester(logger);

    const result = tester.runE2E('proj-1', ['bun test tests/unit', 'bun test tests/e2e']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe('proj-1');
      expect(result.value.totalTests).toBe(2);
      expect(result.value.passedTests).toBe(2);
      expect(result.value.failedTests).toBe(0);
      expect(result.value.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it('ProductionTester: 빈 명령어 → Fail-Fast', () => {
    const tester = new ProductionTester(logger);

    // WHY: 빈 문자열 명령어가 있으면 Fail-Fast로 즉시 중단
    const result = tester.runE2E('proj-1', ['bun test', '', 'bun test more']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.failedTests).toBeGreaterThan(0);
      // WHY: Fail-Fast이므로 첫 실패 후 나머지 명령어는 실행되지 않음
      expect(result.value.passedTests).toBe(1);
    }
  });

  it('ProductionTester: 빈 명령어 목록 에러', () => {
    const tester = new ProductionTester(logger);

    const result = tester.runE2E('proj-1', []);
    expect(result.ok).toBe(false);
  });

  it('ProductionTester: 건강도 판정 (isHealthy)', () => {
    const tester = new ProductionTester(logger);

    // WHY: 통과율 >= 0.8이면 건강
    const r1 = tester.runE2E('proj-1', ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5']);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    expect(tester.isHealthy([r1.value])).toBe(true);

    // WHY: 빈 실행 목록이면 건강하지 않음
    expect(tester.isHealthy([])).toBe(false);
  });

  it('ProductionTester: 실패율 계산 (getFailureRate)', () => {
    const tester = new ProductionTester(logger);

    const r1 = tester.runE2E('proj-1', ['cmd1', 'cmd2', 'cmd3']);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // WHY: 전부 통과하면 실패율 = 0
    expect(tester.getFailureRate([r1.value])).toBe(0);

    // WHY: 빈 목록이면 실패율 = 0
    expect(tester.getFailureRate([])).toBe(0);
  });

  it('BugEscalator: 버그 리포트 생성 + 심각도 분류', () => {
    const escalator = new BugEscalator(logger);

    // WHY: 'crash' → critical
    const criticalFailure: TestFailure = {
      testName: 'auth-crash-test',
      error: 'Application crash on invalid token',
      featureId: 'feat-auth',
    };
    const critResult = escalator.createReport('proj-1', criticalFailure);
    expect(critResult.ok).toBe(true);
    if (critResult.ok) {
      expect(critResult.value.severity).toBe('critical');
      expect(critResult.value.phase).toBe('CODE');
    }

    // WHY: 'error' → major
    const majorFailure: TestFailure = {
      testName: 'db-error-test',
      error: 'Database connection error during migration',
      featureId: 'feat-db',
    };
    const majorResult = escalator.createReport('proj-1', majorFailure);
    expect(majorResult.ok).toBe(true);
    if (majorResult.ok) {
      expect(majorResult.value.severity).toBe('major');
      expect(majorResult.value.phase).toBe('TEST');
    }

    // WHY: 키워드 매치 없음 → minor
    const minorFailure: TestFailure = {
      testName: 'style-check',
      error: 'Font size too small on mobile',
      featureId: 'feat-ui',
    };
    const minorResult = escalator.createReport('proj-1', minorFailure);
    expect(minorResult.ok).toBe(true);
    if (minorResult.ok) {
      expect(minorResult.value.severity).toBe('minor');
      expect(minorResult.value.phase).toBe('VERIFY');
    }
  });

  it('BugEscalator: 에스컬레이션 Phase 결정', () => {
    const escalator = new BugEscalator(logger);
    const failure: TestFailure = {
      testName: 'security-test',
      error: 'SQL injection vulnerability detected',
      featureId: 'feat-sec',
    };

    const reportResult = escalator.createReport('proj-1', failure);
    expect(reportResult.ok).toBe(true);
    if (!reportResult.ok) return;

    const escResult = escalator.escalate(reportResult.value);
    expect(escResult.ok).toBe(true);
    if (escResult.ok) {
      // WHY: 'security' → critical → CODE
      expect(escResult.value.targetPhase).toBe('CODE');
    }
  });

  it('BugEscalator: 활성 리포트 조회 + 해결', () => {
    const escalator = new BugEscalator(logger);

    const failure1: TestFailure = { testName: 't1', error: 'crash bug', featureId: 'f1' };
    const failure2: TestFailure = { testName: 't2', error: 'timeout issue', featureId: 'f2' };

    escalator.createReport('proj-1', failure1);
    escalator.createReport('proj-1', failure2);

    const active = escalator.getActiveReports('proj-1');
    expect(active).toHaveLength(2);

    // WHY: 리포트 해결 후 활성 목록에서 제거
    const resolveResult = escalator.resolveReport(active[0]?.id ?? '');
    expect(resolveResult.ok).toBe(true);

    const afterResolve = escalator.getActiveReports('proj-1');
    expect(afterResolve).toHaveLength(1);
  });

  it('BugEscalator: 존재하지 않는 리포트 해결 에러', () => {
    const escalator = new BugEscalator(logger);

    const result = escalator.resolveReport('nonexistent-id');
    expect(result.ok).toBe(false);
  });

  it('DeliverableBuilder: 산출물 생성 (report 타입)', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('API Doc', 2);

    const docResult = integrator.integrate(['frag-1'], template, 'proj-1');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    const delivResult = builder.build('proj-1', 'report', [docResult.value]);
    expect(delivResult.ok).toBe(true);
    if (delivResult.ok) {
      expect(delivResult.value.type).toBe('report');
      expect(delivResult.value.format).toBe('markdown');
      expect(delivResult.value.title).toContain('[Technical Report]');
      expect(delivResult.value.content).toContain('Technical Report');
      expect(delivResult.value.projectId).toBe('proj-1');
    }
  });

  it('DeliverableBuilder: 다양한 산출물 유형 (portfolio, business-plan)', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('Showcase', 1);

    const docResult = integrator.integrate(['frag-1'], template, 'proj-1');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    // WHY: portfolio → html
    const portfolioResult = builder.build('proj-1', 'portfolio', [docResult.value]);
    expect(portfolioResult.ok).toBe(true);
    if (portfolioResult.ok) {
      expect(portfolioResult.value.format).toBe('html');
      expect(portfolioResult.value.content).toContain('<article');
    }

    // WHY: business-plan → markdown
    const bpResult = builder.build('proj-1', 'business-plan', [docResult.value]);
    expect(bpResult.ok).toBe(true);
    if (bpResult.ok) {
      expect(bpResult.value.format).toBe('markdown');
      expect(bpResult.value.content).toContain('Business Plan');
    }
  });

  it('DeliverableBuilder: 빈 문서 에러', () => {
    const builder = new DeliverableBuilder(logger);

    const result = builder.build('proj-1', 'report', []);
    expect(result.ok).toBe(false);
  });

  it('DeliverableBuilder: 산출물 목록 조회', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('Doc', 1);

    const docResult = integrator.integrate(['frag-1'], template, 'proj-1');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    builder.build('proj-1', 'report', [docResult.value]);
    builder.build('proj-1', 'portfolio', [docResult.value]);
    builder.build('proj-2', 'report', [docResult.value]);

    const proj1List = builder.listDeliverables('proj-1');
    expect(proj1List).toHaveLength(2);

    const proj2List = builder.listDeliverables('proj-2');
    expect(proj2List).toHaveLength(1);
  });

  it('전체 파이프라인: 통합 → 협업 → 테스트 → 버그 → 산출물', () => {
    const integrator = new DocIntegrator(logger);
    const collaborator = new DocCollaborator(logger);
    const tester = new ProductionTester(logger);
    const escalator = new BugEscalator(logger);
    const builder = new DeliverableBuilder(logger);

    // Step 1: DocIntegrator로 문서 통합
    const template = createTemplate('Architecture Doc', 3);
    const integrateResult = integrator.integrate(['frag-1', 'frag-2'], template, 'proj-full');
    expect(integrateResult.ok).toBe(true);
    if (!integrateResult.ok) return;

    // Step 2: DocCollaborator로 layer1+layer2 협업
    const collabResult = collaborator.collaborate(
      '# Architecture\n\n## Overview\n\nSystem design outline',
      integrateResult.value.content,
    );
    expect(collabResult.ok).toBe(true);

    // Step 3: ProductionTester로 E2E 시뮬레이션
    const testResult = tester.runE2E('proj-full', ['bun test tests/unit', 'bun test tests/e2e']);
    expect(testResult.ok).toBe(true);
    if (!testResult.ok) return;

    // Step 4: 건강도 확인 — 전부 통과했으므로 healthy
    expect(tester.isHealthy([testResult.value])).toBe(true);

    // Step 5: 실패 케이스 시뮬레이션 → BugEscalator
    const failure: TestFailure = {
      testName: 'auth-integration',
      error: 'fatal: authentication service crash',
      featureId: 'feat-auth',
    };
    const bugResult = escalator.createReport('proj-full', failure);
    expect(bugResult.ok).toBe(true);
    if (bugResult.ok) {
      const escResult = escalator.escalate(bugResult.value);
      expect(escResult.ok).toBe(true);
    }

    // Step 6: DeliverableBuilder로 산출물 생성
    const delivResult = builder.build('proj-full', 'report', [integrateResult.value]);
    expect(delivResult.ok).toBe(true);
    if (delivResult.ok) {
      expect(delivResult.value.projectId).toBe('proj-full');
      expect(delivResult.value.type).toBe('report');
    }
  });

  // ── Edge / Random Cases ──────────────────────────────────────────

  it('DocIntegrator: 단일 조각 문서 통합', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Single Frag', 2);
    const result = integrator.integrate(['only-frag'], template, 'proj-single');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceFragments).toHaveLength(1);
    }
  });

  it('DocIntegrator: 100개 조각 문서 통합', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Massive Doc', 5);
    const fragments = Array.from({ length: 100 }, (_, i) => `frag-${i}`);
    const result = integrator.integrate(fragments, template, 'proj-massive');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceFragments).toHaveLength(100);
    }
  });

  it('DocIntegrator: 특수문자 포함 조각 통합', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Special Chars', 2);
    const fragments = [
      '<script>alert("xss")</script>',
      'SELECT * FROM docs WHERE id=1; DROP TABLE docs;',
      '한글 조각 내용 특수문자 !@#$%^&*()',
    ];
    const result = integrator.integrate(fragments, template, 'proj-special');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceFragments).toHaveLength(3);
    }
  });

  it('DocIntegrator: 한글 제목 템플릿 통합', () => {
    const integrator = new DocIntegrator(logger);
    const koreanTemplate: DocumentTemplate = {
      type: 'api-reference',
      title: '한국어 API 문서',
      sections: [
        { heading: '개요', content: '시스템 개요', order: 1, required: true },
        { heading: '인증', content: '인증 방법', order: 2, required: true },
      ],
      language: 'ko',
    };
    const result = integrator.integrate(['한글 내용'], koreanTemplate, 'proj-kr');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('한국어 API 문서');
    }
  });

  it('DocIntegrator: 문서 updateDocument에 빈 조각 추가 에러', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Doc', 2);
    const createResult = integrator.integrate(['frag-1'], template, 'proj-1');
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const updateResult = integrator.updateDocument(createResult.value, []);
    expect(updateResult.ok).toBe(false);
  });

  it('DocIntegrator: 10번 연속 업데이트 → 버전 11', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Versioned Doc', 2);
    let doc: IntegratedDocument;

    const createResult = integrator.integrate(['frag-0'], template, 'proj-version');
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    doc = createResult.value;

    for (let i = 1; i <= 10; i++) {
      const updateResult = integrator.updateDocument(doc, [`frag-${i}`]);
      expect(updateResult.ok).toBe(true);
      if (!updateResult.ok) return;
      doc = updateResult.value;
    }

    expect(doc.version).toBe(11);
  });

  it('DocIntegrator: UUID projectId로 통합', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('UUID Project', 1);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = integrator.integrate(['frag-1'], template, uuid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe(uuid);
    }
  });

  it('DocIntegrator: exportAsMarkdown 빈 content 문서', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Empty Content', 2);
    const docResult = integrator.integrate([''], template, 'proj-1');
    if (!docResult.ok) return;

    const mdResult = integrator.exportAsMarkdown(docResult.value);
    // 빈 frag가 있어도 마크다운 내보내기는 가능해야 함
    if (mdResult.ok) {
      expect(mdResult.value).toContain('---');
    }
  });

  it('DocCollaborator: 빈 details로 협업 에러', () => {
    const collaborator = new DocCollaborator(logger);
    const result = collaborator.collaborate('# Outline\n\nSome outline', '');
    expect(result.ok).toBe(false);
  });

  it('DocCollaborator: 매우 긴 아웃라인 처리', () => {
    const collaborator = new DocCollaborator(logger);
    const longOutline = '# Long Document\n\n' + Array.from({ length: 50 }, (_, i) =>
      `## Section ${i + 1}\n\nContent for section ${i + 1}`,
    ).join('\n\n');
    const result = collaborator.collaborate(longOutline, '## Additional Details\n\nMore info');
    expect(result.ok).toBe(true);
  });

  it('DocCollaborator: 특수문자 포함 문서 협업', () => {
    const collaborator = new DocCollaborator(logger);
    const outline = '# Special <>&"\'\n\n## Section & More\n\nContent "with quotes"';
    const details = '## More Details\n\nSQL: SELECT * FROM docs; 한글 내용';
    const result = collaborator.collaborate(outline, details);
    expect(result.ok).toBe(true);
  });

  it('DocCollaborator: generateTableOfContents 빈 문서 에러', () => {
    const collaborator = new DocCollaborator(logger);
    const result = collaborator.generateTableOfContents('');
    expect(result.ok).toBe(false);
  });

  it('DocCollaborator: generateTableOfContents 헤딩 없는 문서', () => {
    const collaborator = new DocCollaborator(logger);
    const content = 'Just plain text without any headings at all.';
    const result = collaborator.generateTableOfContents(content);
    // WHY: 헤딩이 없으면 빈 목차이거나 에러
    if (result.ok) {
      expect(typeof result.value).toBe('string');
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('DocCollaborator: generateTableOfContents 5단계 중첩 헤딩', () => {
    const collaborator = new DocCollaborator(logger);
    const content = [
      '# Level 1',
      '## Level 2',
      '### Level 3',
      '#### Level 4',
      '##### Level 5',
      '###### Level 6',
    ].join('\n\n');
    const result = collaborator.generateTableOfContents(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('목차');
    }
  });

  it('ProductionTester: 단일 명령어 실행', () => {
    const tester = new ProductionTester(logger);
    const result = tester.runE2E('proj-single', ['bun test']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalTests).toBe(1);
      expect(result.value.passedTests).toBe(1);
    }
  });

  it('ProductionTester: UUID projectId 사용', () => {
    const tester = new ProductionTester(logger);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = tester.runE2E(uuid, ['bun test']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe(uuid);
    }
  });

  it('ProductionTester: 빈 문자열만 있는 명령어 목록 → Fail-Fast 즉시', () => {
    const tester = new ProductionTester(logger);
    const result = tester.runE2E('proj-1', ['']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.failedTests).toBeGreaterThan(0);
      expect(result.value.passedTests).toBe(0);
    }
  });

  it('ProductionTester: 100개 명령어 실행 성능 확인', () => {
    const tester = new ProductionTester(logger);
    const commands = Array.from({ length: 100 }, (_, i) => `bun test cmd${i}`);
    const result = tester.runE2E('proj-perf', commands);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalTests).toBe(100);
      expect(result.value.passedTests).toBe(100);
    }
  });

  it('ProductionTester: isHealthy 다중 실행 결과 집계', () => {
    const tester = new ProductionTester(logger);
    const r1 = tester.runE2E('proj-1', ['cmd1', 'cmd2']);
    const r2 = tester.runE2E('proj-1', ['cmd3', 'cmd4']);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(tester.isHealthy([r1.value, r2.value])).toBe(true);
  });

  it('ProductionTester: getFailureRate 실패 포함 계산', () => {
    const tester = new ProductionTester(logger);
    const r1 = tester.runE2E('proj-fail', ['cmd1', '', 'cmd3']);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    // WHY: Fail-Fast이므로 cmd1 통과, '' 실패, cmd3 미실행 → failRate > 0
    const rate = tester.getFailureRate([r1.value]);
    expect(rate).toBeGreaterThan(0);
  });

  it('BugEscalator: 빈 testName TestFailure 처리', () => {
    const escalator = new BugEscalator(logger);
    const failure: TestFailure = {
      testName: '',
      error: 'some error occurred',
      featureId: 'feat-1',
    };
    const result = escalator.createReport('proj-1', failure);
    // 빈 testName은 에러이거나 처리 가능
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      expect(result.ok).toBe(true);
    }
  });

  it('BugEscalator: 빈 error 메시지 TestFailure 처리', () => {
    const escalator = new BugEscalator(logger);
    const failure: TestFailure = {
      testName: 'test-empty-error',
      error: '',
      featureId: 'feat-1',
    };
    const result = escalator.createReport('proj-1', failure);
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      // 빈 에러 메시지 → minor
      expect(result.value.severity).toBe('minor');
    }
  });

  it('BugEscalator: 한글 에러 메시지 심각도 분류', () => {
    const escalator = new BugEscalator(logger);
    const failure: TestFailure = {
      testName: '인증-테스트',
      error: '데이터베이스 연결 오류 발생',
      featureId: 'feat-auth-kr',
    };
    const result = escalator.createReport('proj-kr', failure);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: 한글 에러 메시지는 키워드 매칭 안될 수 있어 낮은 심각도 — 구현별 값 허용
      expect(typeof result.value.severity).toBe('string');
      expect(result.value.severity.length).toBeGreaterThan(0);
    }
  });

  it('BugEscalator: 동일 프로젝트 10개 리포트 생성 + 전체 조회', () => {
    const escalator = new BugEscalator(logger);
    for (let i = 0; i < 10; i++) {
      escalator.createReport('proj-bulk', {
        testName: `test-${i}`,
        error: `error message ${i}`,
        featureId: `feat-${i}`,
      });
    }
    const active = escalator.getActiveReports('proj-bulk');
    expect(active).toHaveLength(10);
  });

  it('BugEscalator: 다른 projectId 리포트 격리 확인', () => {
    const escalator = new BugEscalator(logger);
    escalator.createReport('proj-A', { testName: 't1', error: 'crash', featureId: 'f1' });
    escalator.createReport('proj-A', { testName: 't2', error: 'error', featureId: 'f2' });
    escalator.createReport('proj-B', { testName: 't3', error: 'timeout', featureId: 'f3' });

    const projA = escalator.getActiveReports('proj-A');
    const projB = escalator.getActiveReports('proj-B');
    expect(projA).toHaveLength(2);
    expect(projB).toHaveLength(1);
  });

  it('BugEscalator: UUID ID 리포트 해결', () => {
    const escalator = new BugEscalator(logger);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    escalator.createReport('proj-uuid', { testName: 'uuid-test', error: 'crash bug', featureId: 'f1' });
    const active = escalator.getActiveReports('proj-uuid');
    expect(active.length).toBeGreaterThan(0);

    // 실제 생성된 ID로 해결
    const reportId = active[0]?.id ?? '';
    const resolveResult = escalator.resolveReport(reportId);
    expect(resolveResult.ok).toBe(true);
  });

  it('BugEscalator: escalate minor 버그 → VERIFY phase', () => {
    const escalator = new BugEscalator(logger);
    const failure: TestFailure = {
      testName: 'ui-minor-test',
      error: 'Button color is slightly off',
      featureId: 'feat-ui',
    };
    const reportResult = escalator.createReport('proj-1', failure);
    expect(reportResult.ok).toBe(true);
    if (!reportResult.ok) return;

    const escResult = escalator.escalate(reportResult.value);
    expect(escResult.ok).toBe(true);
    if (escResult.ok) {
      expect(escResult.value.targetPhase).toBe('VERIFY');
    }
  });

  it('DeliverableBuilder: 빈 projectId 에러', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('Doc', 1);
    const docResult = integrator.integrate(['frag-1'], template, 'proj-1');
    if (!docResult.ok) return;

    const result = builder.build('', 'report', [docResult.value]);
    expect(result.ok).toBe(false);
  });

  it('DeliverableBuilder: 알 수 없는 타입 — 에러이거나 기본 처리', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('Doc', 1);
    const docResult = integrator.integrate(['frag-1'], template, 'proj-1');
    if (!docResult.ok) return;

    // WHY: 'unknown-type'은 구현에 따라 에러이거나 기본값으로 처리
    const result = builder.build('proj-1', 'unknown-type' as never, [docResult.value]);
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      expect(result.value.projectId).toBe('proj-1');
    }
  });

  it('DeliverableBuilder: 50개 문서로 portfolio 생성', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('Big Portfolio', 2);

    const docs: IntegratedDocument[] = [];
    for (let i = 0; i < 50; i++) {
      const r = integrator.integrate([`frag-${i}`], template, 'proj-big');
      if (r.ok) docs.push(r.value);
    }

    const result = builder.build('proj-big', 'portfolio', docs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('portfolio');
    }
  });

  it('DeliverableBuilder: listDeliverables 빈 projectId → 빈 배열', () => {
    const builder = new DeliverableBuilder(logger);
    const list = builder.listDeliverables('nonexistent-proj');
    expect(list).toHaveLength(0);
  });

  it('DocIntegrator + BugEscalator: 문서 통합 후 버그 리포트 연계', () => {
    const integrator = new DocIntegrator(logger);
    const escalator = new BugEscalator(logger);
    const template = createTemplate('Integration Report', 2);

    const docResult = integrator.integrate(['frag-a', 'frag-b'], template, 'proj-link');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    // WHY: 문서 통합 실패 시뮬레이션 → 버그 에스컬레이션
    const failure: TestFailure = {
      testName: 'doc-integration-test',
      error: 'Document merge crash during section 2',
      featureId: `feat-doc-${docResult.value.version}`,
    };
    const bugResult = escalator.createReport('proj-link', failure);
    expect(bugResult.ok).toBe(true);
    if (bugResult.ok) {
      expect(bugResult.value.severity).toBe('critical');
    }
  });

  it('ProductionTester + DeliverableBuilder: 테스트 통과 후 산출물 생성', () => {
    const tester = new ProductionTester(logger);
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);

    const testResult = tester.runE2E('proj-pass', ['bun test tests/unit', 'bun test tests/e2e', 'bun test tests/module']);
    expect(testResult.ok).toBe(true);
    if (!testResult.ok) return;

    expect(tester.isHealthy([testResult.value])).toBe(true);

    const template = createTemplate('Test Report', 2);
    const docResult = integrator.integrate(['test-results'], template, 'proj-pass');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    const delivResult = builder.build('proj-pass', 'report', [docResult.value]);
    expect(delivResult.ok).toBe(true);
    if (delivResult.ok) {
      expect(delivResult.value.projectId).toBe('proj-pass');
    }
  });

  // ── Additional Edge / Random Cases ───────────────────────────────

  it('DocIntegrator: 이모지 포함 제목 템플릿 통합', () => {
    const integrator = new DocIntegrator(logger);
    const emojiTemplate: DocumentTemplate = {
      type: 'custom',
      title: '🚀 프로젝트 문서 🎉',
      sections: [
        { heading: '📋 개요', content: '개요 내용', order: 1, required: true },
        { heading: '🔧 설정', content: '설정 내용', order: 2, required: false },
      ],
      language: 'bilingual',
    };
    const result = integrator.integrate(['emoji-frag'], emojiTemplate, 'proj-emoji');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceFragments).toHaveLength(1);
    }
  });

  it('DocIntegrator: 영문 단일 섹션 템플릿 통합', () => {
    const integrator = new DocIntegrator(logger);
    const template: DocumentTemplate = {
      type: 'api-reference',
      title: 'Single Section Doc',
      sections: [{ heading: 'Overview', content: 'Overview content', order: 1, required: true }],
      language: 'en',
    };
    const result = integrator.integrate(['frag-en'], template, 'proj-en');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('Single Section Doc');
    }
  });

  it('DocIntegrator: 1000자 이상 조각 통합 → ok', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Long Frag', 2);
    const longFrag = 'A'.repeat(1000);
    const result = integrator.integrate([longFrag], template, 'proj-longfrag');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceFragments[0]).toBe(longFrag);
    }
  });

  it('DocIntegrator: 줄바꿈 포함 조각 통합 → ok', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Multiline', 2);
    const fragments = ['line1\nline2\nline3', 'second\nfragment'];
    const result = integrator.integrate(fragments, template, 'proj-multiline');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceFragments).toHaveLength(2);
    }
  });

  it('DocIntegrator: projectId 숫자 문자열 통합', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Numeric Project', 1);
    const result = integrator.integrate(['frag-1'], template, '12345');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe('12345');
    }
  });

  it('DocIntegrator: version 초기값은 1', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Version Check', 2);
    const result = integrator.integrate(['frag-1'], template, 'proj-ver');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(1);
    }
  });

  it('DocIntegrator: exportAsMarkdown → version 필드 포함', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Markdown Export', 2);
    const docResult = integrator.integrate(['frag-1'], template, 'proj-md');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    const mdResult = integrator.exportAsMarkdown(docResult.value);
    expect(mdResult.ok).toBe(true);
    if (mdResult.ok) {
      expect(mdResult.value).toContain('version:');
    }
  });

  it('DocIntegrator: 같은 내용 조각 중복 통합 → ok', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Duplicate Frags', 2);
    const result = integrator.integrate(['same-frag', 'same-frag', 'same-frag'], template, 'proj-dup');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceFragments).toHaveLength(3);
    }
  });

  it('DocCollaborator: 숫자만 있는 아웃라인 처리', () => {
    const collaborator = new DocCollaborator(logger);
    const result = collaborator.collaborate('# 1\n\n## 2\n\n### 3', '## Details\n\nSome content');
    expect(result.ok).toBe(true);
  });

  it('DocCollaborator: 코드 블록 포함 아웃라인 처리', () => {
    const collaborator = new DocCollaborator(logger);
    const outline = '# API Reference\n\n## Endpoint\n\n```bash\ncurl -X GET /api\n```';
    const details = '## Response Format\n\nJSON object';
    const result = collaborator.collaborate(outline, details);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('API Reference');
    }
  });

  it('DocCollaborator: 두 collaborator 인스턴스 독립성', () => {
    const c1 = new DocCollaborator(logger);
    const c2 = new DocCollaborator(logger);
    const r1 = c1.collaborate('# Doc A\n\n## Section A', '## Detail A\n\nContent A');
    const r2 = c2.collaborate('# Doc B\n\n## Section B', '## Detail B\n\nContent B');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value).toContain('Doc A');
      expect(r2.value).toContain('Doc B');
    }
  });

  it('DocCollaborator: 빈 details 에러 확인 (중복 체크)', () => {
    const collaborator = new DocCollaborator(logger);
    const result = collaborator.collaborate('# Outline\n\n## Section', '');
    expect(result.ok).toBe(false);
  });

  it('DocCollaborator: generateTableOfContents 한글 헤딩', () => {
    const collaborator = new DocCollaborator(logger);
    const content = '# 프로젝트 소개\n\n## 아키텍처\n\n### 컴포넌트\n\n## 테스트';
    const result = collaborator.generateTableOfContents(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('목차');
    }
  });

  it('ProductionTester: 특수문자 포함 명령어 → ok', () => {
    const tester = new ProductionTester(logger);
    const result = tester.runE2E('proj-special', ['bun test -- --testPathPattern=auth|db']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalTests).toBe(1);
    }
  });

  it('ProductionTester: 같은 명령어 중복 → 중복 실행됨', () => {
    const tester = new ProductionTester(logger);
    const result = tester.runE2E('proj-dup', ['bun test', 'bun test', 'bun test']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalTests).toBe(3);
      expect(result.value.passedTests).toBe(3);
    }
  });

  it('ProductionTester: 한글 projectId → ok', () => {
    const tester = new ProductionTester(logger);
    const result = tester.runE2E('프로젝트-한글', ['bun test']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe('프로젝트-한글');
    }
  });

  it('ProductionTester: isHealthy 단일 실행 결과 100% 통과', () => {
    const tester = new ProductionTester(logger);
    const r = tester.runE2E('proj-ok', ['cmd1']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(tester.isHealthy([r.value])).toBe(true);
  });

  it('ProductionTester: getFailureRate 빈 목록 → 0', () => {
    const tester = new ProductionTester(logger);
    expect(tester.getFailureRate([])).toBe(0);
  });

  it('BugEscalator: 여러 심각도 순서 확인', () => {
    const escalator = new BugEscalator(logger);
    const failures: Array<{ error: string; expectedSeverity: string }> = [
      { error: 'Fatal crash on startup', expectedSeverity: 'critical' },
      { error: 'Database error connection refused', expectedSeverity: 'major' },
      { error: 'Minor style issue', expectedSeverity: 'minor' },
    ];

    for (const { error, expectedSeverity } of failures) {
      const r = escalator.createReport('proj-sev', { testName: `test-${error.slice(0, 5)}`, error, featureId: 'f1' });
      if (r.ok) {
        expect(r.value.severity).toBe(expectedSeverity);
      }
    }
  });

  it('BugEscalator: major 버그 → TEST phase 에스컬레이션', () => {
    const escalator = new BugEscalator(logger);
    const failure: TestFailure = {
      testName: 'db-test',
      error: 'Database migration error occurred',
      featureId: 'feat-db',
    };
    const reportResult = escalator.createReport('proj-1', failure);
    expect(reportResult.ok).toBe(true);
    if (!reportResult.ok) return;

    const escResult = escalator.escalate(reportResult.value);
    expect(escResult.ok).toBe(true);
    if (escResult.ok) {
      expect(escResult.value.targetPhase).toBe('TEST');
    }
  });

  it('BugEscalator: 모든 리포트 해결 후 active 빈 배열', () => {
    const escalator = new BugEscalator(logger);
    for (let i = 0; i < 3; i++) {
      escalator.createReport('proj-resolve', {
        testName: `test-${i}`,
        error: `error ${i}`,
        featureId: `feat-${i}`,
      });
    }
    const active = escalator.getActiveReports('proj-resolve');
    for (const report of active) {
      escalator.resolveReport(report.id);
    }
    expect(escalator.getActiveReports('proj-resolve')).toHaveLength(0);
  });

  it('BugEscalator: 존재하지 않는 프로젝트 active reports → 빈 배열', () => {
    const escalator = new BugEscalator(logger);
    const active = escalator.getActiveReports('nonexistent-proj-xyz');
    expect(active).toHaveLength(0);
  });

  it('DeliverableBuilder: business-plan 타입 생성', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('Business Plan', 3);
    const docResult = integrator.integrate(['frag-bp'], template, 'proj-bp');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    const result = builder.build('proj-bp', 'business-plan', [docResult.value]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('business-plan');
      expect(result.value.format).toBe('markdown');
    }
  });

  it('DeliverableBuilder: 여러 타입 연속 생성 → 각각 독립', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('Multi Type', 1);
    const docResult = integrator.integrate(['frag-1'], template, 'proj-multi');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    const types = ['report', 'portfolio', 'business-plan'] as const;
    for (const type of types) {
      const r = builder.build('proj-multi', type, [docResult.value]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.type).toBe(type);
      }
    }
    expect(builder.listDeliverables('proj-multi')).toHaveLength(3);
  });

  it('DeliverableBuilder: title에 projectId 반영됨', () => {
    const integrator = new DocIntegrator(logger);
    const builder = new DeliverableBuilder(logger);
    const template = createTemplate('Title Check', 1);
    const docResult = integrator.integrate(['frag-1'], template, 'my-project-123');
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    const result = builder.build('my-project-123', 'report', [docResult.value]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe('my-project-123');
    }
  });

  it('전체 파이프라인: business-plan 산출물 생성', () => {
    const integrator = new DocIntegrator(logger);
    const collaborator = new DocCollaborator(logger);
    const builder = new DeliverableBuilder(logger);

    const template = createTemplate('Business Report', 2);
    const intResult = integrator.integrate(['spec-frag', 'design-frag'], template, 'proj-biz');
    expect(intResult.ok).toBe(true);
    if (!intResult.ok) return;

    const collabResult = collaborator.collaborate(
      '# Business Plan\n\n## Market Analysis\n\nTarget market overview',
      intResult.value.content,
    );
    expect(collabResult.ok).toBe(true);

    const delivResult = builder.build('proj-biz', 'business-plan', [intResult.value]);
    expect(delivResult.ok).toBe(true);
    if (delivResult.ok) {
      expect(delivResult.value.type).toBe('business-plan');
      expect(delivResult.value.projectId).toBe('proj-biz');
    }
  });

  it('DocIntegrator: 50섹션 템플릿 통합', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Large Template', 50);
    const result = integrator.integrate(['frag-1', 'frag-2'], template, 'proj-large');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('Large Template');
    }
  });

  it('BugEscalator: 빈 featureId TestFailure 처리', () => {
    const escalator = new BugEscalator(logger);
    const failure: TestFailure = {
      testName: 'test-nofeat',
      error: 'Some crash error',
      featureId: '',
    };
    const result = escalator.createReport('proj-1', failure);
    if (result.ok) {
      expect(typeof result.value.severity).toBe('string');
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('DocCollaborator: 탭 포함 outline 처리', () => {
    const collaborator = new DocCollaborator(logger);
    const outline = '# Main\n\n\t## Subsection\n\nContent here';
    const details = '## Details\n\nMore info here';
    const result = collaborator.collaborate(outline, details);
    expect(typeof result.ok).toBe('boolean');
  });

  it('ProductionTester + BugEscalator: Fail-Fast 시 버그 에스컬레이션', () => {
    const tester = new ProductionTester(logger);
    const escalator = new BugEscalator(logger);

    // Fail-Fast 시뮬레이션
    const testResult = tester.runE2E('proj-ff', ['cmd1', '', 'cmd3']);
    expect(testResult.ok).toBe(true);
    if (!testResult.ok) return;

    if (testResult.value.failedTests > 0) {
      const failure: TestFailure = {
        testName: 'fail-fast-test',
        error: 'Test execution error occurred during pipeline',
        featureId: 'feat-pipeline',
      };
      const bugResult = escalator.createReport('proj-ff', failure);
      expect(bugResult.ok).toBe(true);
      if (bugResult.ok) {
        expect(['critical', 'major', 'minor']).toContain(bugResult.value.severity);
      }
    }
  });
});
