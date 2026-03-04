/**
 * 설계자 / Designer
 *
 * @description
 * KR: 기획 문서와 기능 명세를 바탕으로 상세 설계 문서를 생성하고 검증한다.
 * EN: Creates and validates a detailed design document from plan and feature specs.
 */

import { AdevError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { FeatureSpec } from './types.js';

// ── Designer ────────────────────────────────────────────────────

/**
 * 설계자 / Designer
 *
 * @description
 * KR: 기획과 기능 명세를 분석하여 상세 설계 문서를 작성하고,
 *     설계의 정합성을 검증한다.
 * EN: Analyzes plan and feature specs to produce a detailed design document,
 *     and validates design consistency.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const designer = new Designer(logger);
 * const design = designer.createDesign('proj-1', plan, features);
 */
export class Designer {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'designer' });
  }

  /**
   * 설계 문서 생성 / Create a design document
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param plan - 기획 문서 / Plan document
   * @param features - 기능 명세 목록 / Feature specification list
   * @returns 설계 문서 (마크다운) / Design document (markdown)
   */
  createDesign(projectId: string, plan: string, features: readonly FeatureSpec[]): Result<string> {
    this.logger.debug('설계 문서 생성 시작', {
      projectId,
      featureCount: features.length,
    });

    if (plan.trim().length === 0) {
      return err(new AdevError('layer1_empty_plan', '빈 기획 문서로 설계를 생성할 수 없습니다'));
    }

    if (features.length === 0) {
      return err(
        new AdevError('layer1_no_features', '기능 명세가 없으면 설계를 생성할 수 없습니다'),
      );
    }

    const design = buildDesignDocument(projectId, plan, features);
    this.logger.info('설계 문서 생성 완료', { projectId });
    return ok(design);
  }

  /**
   * 설계 문서 검증 / Validate a design document
   *
   * @param design - 설계 문서 / Design document
   * @param features - 기능 명세 목록 / Feature specification list
   * @returns 발견된 문제 목록 (빈 배열이면 정상) / List of issues (empty = valid)
   */
  validateDesign(design: string, features: readonly FeatureSpec[]): Result<string[]> {
    this.logger.debug('설계 검증 시작', { featureCount: features.length });

    const issues: string[] = [];

    if (design.trim().length === 0) {
      issues.push('설계 문서가 비어 있습니다 / Design document is empty');
    }

    // WHY: 각 기능이 설계 문서에 반영되었는지 확인
    for (const feature of features) {
      if (!design.includes(feature.id)) {
        issues.push(
          `기능 '${feature.name}' (${feature.id})이 설계에 포함되지 않았습니다 / ` +
            `Feature '${feature.name}' (${feature.id}) is not included in the design`,
        );
      }
    }

    // WHY: 의존성이 있는 기능이 설계에서 의존성 섹션을 가지는지 확인
    const featuresWithDeps = features.filter((f) => f.dependencies.length > 0);
    if (featuresWithDeps.length > 0 && !design.includes('Dependencies')) {
      issues.push(
        '의존성이 있는 기능이 있지만 Dependencies 섹션이 없습니다 / ' +
          'Features have dependencies but no Dependencies section found',
      );
    }

    this.logger.info('설계 검증 완료', { issueCount: issues.length });
    return ok(issues);
  }
}

// ── 내부 함수 / Internal Functions ──────────────────────────────

/**
 * 구조화된 설계 문서 생성 / Build structured design document
 */
function buildDesignDocument(
  projectId: string,
  plan: string,
  features: readonly FeatureSpec[],
): string {
  const sections: string[] = [
    `# Design Document: ${projectId}`,
    '',
    '## Overview',
    '',
    `Based on the project plan, this design covers ${features.length} feature(s).`,
    '',
    '## Architecture',
    '',
    buildArchitectureSection(features),
    '',
    '## Feature Designs',
    '',
  ];

  for (const feature of features) {
    sections.push(buildFeatureDesignSection(feature));
  }

  // WHY: 의존성이 있는 기능이 있으면 Dependencies 섹션 추가
  const hasDeps = features.some((f) => f.dependencies.length > 0);
  if (hasDeps) {
    sections.push('## Dependencies');
    sections.push('');
    for (const feature of features) {
      if (feature.dependencies.length > 0) {
        sections.push(`- ${feature.id}: depends on ${feature.dependencies.join(', ')}`);
      }
    }
    sections.push('');
  }

  sections.push('## Source Plan');
  sections.push('');
  sections.push(plan);

  return sections.join('\n');
}

/**
 * 아키텍처 섹션 생성 / Build architecture section
 */
function buildArchitectureSection(features: readonly FeatureSpec[]): string {
  const lines: string[] = [];
  lines.push('### Components');
  lines.push('');
  for (const feature of features) {
    lines.push(`- **${feature.name}** (${feature.id}): ${feature.description}`);
    if (feature.inputs.length > 0) {
      lines.push(`  - Inputs: ${feature.inputs.map((io) => io.name).join(', ')}`);
    }
    if (feature.outputs.length > 0) {
      lines.push(`  - Outputs: ${feature.outputs.map((io) => io.name).join(', ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * 기능별 설계 섹션 생성 / Build per-feature design section
 */
function buildFeatureDesignSection(feature: FeatureSpec): string {
  const lines: string[] = [`### ${feature.name} (${feature.id})`, '', feature.description, ''];

  if (feature.acceptanceCriteria.length > 0) {
    lines.push('#### Acceptance Criteria');
    lines.push('');
    for (const criterion of feature.acceptanceCriteria) {
      lines.push(`- [${criterion.verifiable ? 'x' : ' '}] ${criterion.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
