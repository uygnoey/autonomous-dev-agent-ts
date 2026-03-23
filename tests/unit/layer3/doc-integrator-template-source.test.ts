import { describe, expect, it } from 'bun:test';
import { getDefaultTemplateSource } from 'layer3/doc-integrator-fragment.js';

describe('getDefaultTemplateSource()', () => {
  // ── 유형별 템플릿 존재 확인 / Per-type template existence ────

  const projectTypes = [
    'readme',
    'api-reference',
    'architecture',
    'user-manual',
    'installation-guide',
    'test-report',
    'changelog',
    'contributing-guide',
  ] as const;

  for (const type of projectTypes) {
    it(`[normal] '${type}' 유형 → 비어 있지 않은 템플릿 반환`, () => {
      const source = getDefaultTemplateSource(type);
      expect(source.length).toBeGreaterThan(0);
    });

    it(`[edge] '${type}' 유형 → {{projectName}} 변수 포함`, () => {
      const source = getDefaultTemplateSource(type);
      expect(source).toContain('{{projectName}}');
    });

    it(`[edge] '${type}' 유형 → generatedAt 변수 포함`, () => {
      const source = getDefaultTemplateSource(type);
      expect(source).toContain('{{generatedAt}}');
    });
  }

  // ── 유형별 고유 내용 확인 / Per-type unique content ──────────

  it('[edge] readme → Table of Contents 섹션 포함', () => {
    expect(getDefaultTemplateSource('readme')).toContain('Table of Contents');
  });

  it('[edge] api-reference → Endpoints 섹션 포함', () => {
    expect(getDefaultTemplateSource('api-reference')).toContain('Endpoints');
  });

  it('[edge] api-reference → Error Codes 테이블 포함', () => {
    expect(getDefaultTemplateSource('api-reference')).toContain('Error Codes');
  });

  it('[edge] architecture → System Overview 섹션 포함', () => {
    expect(getDefaultTemplateSource('architecture')).toContain('System Overview');
  });

  it('[edge] user-manual → Getting Started 섹션 포함', () => {
    expect(getDefaultTemplateSource('user-manual')).toContain('Getting Started');
  });

  it('[edge] installation-guide → System Requirements 섹션 포함', () => {
    expect(getDefaultTemplateSource('installation-guide')).toContain('System Requirements');
  });

  it('[edge] test-report → Summary 테이블 포함', () => {
    expect(getDefaultTemplateSource('test-report')).toContain('Total Tests');
  });

  it('[edge] changelog → Semantic Versioning 링크 포함', () => {
    expect(getDefaultTemplateSource('changelog')).toContain('Semantic Versioning');
  });

  it('[edge] contributing-guide → Branch Naming 섹션 포함', () => {
    expect(getDefaultTemplateSource('contributing-guide')).toContain('Branch Naming');
  });

  // ── 각 유형 간 템플릿 중복 없음 / No duplicates between types ─

  it('[edge] 8개 유형이 서로 다른 템플릿을 반환', () => {
    const sources = projectTypes.map((t) => getDefaultTemplateSource(t));
    const uniqueSources = new Set(sources);
    expect(uniqueSources.size).toBe(8);
  });

  // ── 알 수 없는 유형 → 폴백 템플릿 / Unknown type → fallback ─

  it('[edge] 알 수 없는 유형 → 폴백 템플릿 반환', () => {
    const source = getDefaultTemplateSource('unknown-type');
    expect(source).toContain('{{projectName}}');
    expect(source).toContain('{{generatedAt}}');
  });

  it('[edge] 빈 문자열 유형 → 폴백 템플릿 반환', () => {
    const source = getDefaultTemplateSource('');
    expect(source.length).toBeGreaterThan(0);
  });
});
