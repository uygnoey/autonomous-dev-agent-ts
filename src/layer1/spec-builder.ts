/**
 * 스펙 빌더 / Spec builder
 *
 * @description
 * KR: 기획 + 설계 + 기능 명세를 결합하여 최종 스펙 문서를 생성하고 검증한다.
 * EN: Combines plan + design + feature specs into a final spec document
 *     and validates its completeness.
 */

import { AdevError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { FeatureSpec } from './types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 스펙에 필요한 필수 섹션 / Required sections in the spec */
const REQUIRED_SECTIONS = ['Goals', 'Features', 'Design', 'Plan'] as const;

// ── SpecBuilder ─────────────────────────────────────────────────

/**
 * 스펙 빌더 / Spec builder
 *
 * @description
 * KR: 기획, 설계, 기능 명세를 통합하여 최종 스펙 문서를 작성한다.
 * EN: Integrates plan, design, and feature specs into the final spec document.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const builder = new SpecBuilder(logger);
 * const spec = builder.buildSpec(plan, design, features);
 */
export class SpecBuilder {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'spec-builder' });
  }

  /**
   * 스펙 문서 생성 / Build a spec document
   *
   * @param plan - 기획 문서 / Plan document
   * @param design - 설계 문서 / Design document
   * @param features - 기능 명세 목록 / Feature specification list
   * @returns 스펙 문서 (마크다운) / Spec document (markdown)
   */
  buildSpec(plan: string, design: string, features: readonly FeatureSpec[]): Result<string> {
    this.logger.debug('스펙 문서 생성 시작', { featureCount: features.length });

    if (plan.trim().length === 0) {
      return err(new AdevError('layer1_empty_plan', '기획 문서가 비어 있습니다'));
    }

    if (design.trim().length === 0) {
      return err(new AdevError('layer1_empty_design', '설계 문서가 비어 있습니다'));
    }

    const spec = assembleSpec(plan, design, features);
    this.logger.info('스펙 문서 생성 완료', { featureCount: features.length });
    return ok(spec);
  }

  /**
   * 스펙 문서 검증 / Validate a spec document
   *
   * @param spec - 스펙 문서 / Spec document
   * @returns 성공 시 ok(void), 실패 시 err(AdevError) — 누락된 섹션 정보 포함
   */
  validateSpec(spec: string): Result<void> {
    this.logger.debug('스펙 검증 시작');

    if (spec.trim().length === 0) {
      return err(new AdevError('layer1_empty_spec', '스펙 문서가 비어 있습니다'));
    }

    const missingSections: string[] = [];
    for (const section of REQUIRED_SECTIONS) {
      if (!spec.includes(section)) {
        missingSections.push(section);
      }
    }

    if (missingSections.length > 0) {
      return err(
        new AdevError(
          'layer1_incomplete_spec',
          `스펙에 누락된 섹션: ${missingSections.join(', ')}`,
        ),
      );
    }

    this.logger.info('스펙 검증 통과');
    return ok(undefined);
  }
}

// ── 내부 함수 / Internal Functions ──────────────────────────────

/**
 * 스펙 문서 조립 / Assemble spec document
 */
function assembleSpec(plan: string, design: string, features: readonly FeatureSpec[]): string {
  const sections: string[] = [
    '# Specification Document',
    '',
    '## Goals',
    '',
    'Extracted from the project plan and design conversations.',
    '',
    '## Features',
    '',
  ];

  for (const feature of features) {
    sections.push(`### ${feature.name} (${feature.id})`);
    sections.push('');
    sections.push(feature.description);
    sections.push('');

    if (feature.acceptanceCriteria.length > 0) {
      sections.push('**Acceptance Criteria:**');
      for (const criterion of feature.acceptanceCriteria) {
        sections.push(`- ${criterion.description}`);
      }
      sections.push('');
    }

    if (feature.inputs.length > 0) {
      sections.push('**Inputs:**');
      for (const input of feature.inputs) {
        const requiredFlag = input.required ? '(required)' : '(optional)';
        sections.push(`- \`${input.name}\`: ${input.type} ${requiredFlag} — ${input.constraints}`);
      }
      sections.push('');
    }

    if (feature.outputs.length > 0) {
      sections.push('**Outputs:**');
      for (const output of feature.outputs) {
        sections.push(`- \`${output.name}\`: ${output.type} — ${output.constraints}`);
      }
      sections.push('');
    }
  }

  sections.push('## Design');
  sections.push('');
  sections.push(design);
  sections.push('');
  sections.push('## Plan');
  sections.push('');
  sections.push(plan);

  return sections.join('\n');
}
