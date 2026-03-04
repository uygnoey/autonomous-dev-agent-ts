/**
 * 기획자 / Planner
 *
 * @description
 * KR: 대화 이력을 분석하여 구조화된 기획 문서를 생성하고,
 *     기획에서 기능 명세(FeatureSpec)를 추출한다.
 * EN: Analyzes conversation history to produce a structured plan document,
 *     and extracts feature specifications from the plan.
 */

import { AdevError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { ConversationMessage, FeatureSpec } from './types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기획 문서 생성에 필요한 최소 대화 수 / Minimum conversations required */
const MIN_CONVERSATIONS_FOR_PLAN = 1;

// ── Planner ─────────────────────────────────────────────────────

/**
 * 기획자 / Planner
 *
 * @description
 * KR: 사용자 대화를 종합하여 구조화된 기획 문서를 작성한다.
 * EN: Synthesizes user conversations into a structured plan document.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const planner = new Planner(logger);
 * const plan = planner.createPlan('proj-1', conversations);
 */
export class Planner {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'planner' });
  }

  /**
   * 대화를 종합하여 기획 문서 생성 / Synthesize conversations into a plan document
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param conversations - 대화 메시지 목록 / Conversation messages
   * @returns 기획 문서 (마크다운) / Plan document (markdown)
   */
  createPlan(projectId: string, conversations: readonly ConversationMessage[]): Result<string> {
    this.logger.debug('기획 문서 생성 시작', {
      projectId,
      conversationCount: conversations.length,
    });

    if (conversations.length < MIN_CONVERSATIONS_FOR_PLAN) {
      return err(
        new AdevError(
          'layer1_insufficient_data',
          `기획에 최소 ${MIN_CONVERSATIONS_FOR_PLAN}개 대화가 필요합니다 (현재: ${conversations.length})`,
        ),
      );
    }

    const userMessages = conversations
      .filter((msg) => msg.role === 'user')
      .map((msg) => msg.content);

    const assistantMessages = conversations
      .filter((msg) => msg.role === 'assistant')
      .map((msg) => msg.content);

    const plan = buildPlanDocument(projectId, userMessages, assistantMessages);

    this.logger.info('기획 문서 생성 완료', { projectId });
    return ok(plan);
  }

  /**
   * 기획 문서에서 기능 명세 추출 / Extract feature specifications from a plan
   *
   * @param plan - 기획 문서 (마크다운) / Plan document (markdown)
   * @returns FeatureSpec 배열 / Array of FeatureSpec
   */
  extractFeatures(plan: string): Result<FeatureSpec[]> {
    this.logger.debug('기능 명세 추출 시작');

    if (plan.trim().length === 0) {
      return err(new AdevError('layer1_empty_plan', '빈 기획 문서에서 기능을 추출할 수 없습니다'));
    }

    const features = parseFeaturesFromPlan(plan);
    this.logger.info('기능 명세 추출 완료', { featureCount: features.length });
    return ok(features);
  }
}

// ── 내부 함수 / Internal Functions ──────────────────────────────

/**
 * 구조화된 기획 문서 생성 / Build structured plan document
 */
function buildPlanDocument(
  projectId: string,
  userMessages: readonly string[],
  assistantMessages: readonly string[],
): string {
  const sections: string[] = [
    `# Project Plan: ${projectId}`,
    '',
    '## Goals',
    '',
    ...userMessages.map((msg) => `- ${msg}`),
    '',
    '## Analysis',
    '',
    ...assistantMessages.map((msg) => `- ${msg}`),
    '',
    '## Features',
    '',
    '(Features to be extracted from the above analysis)',
    '',
  ];

  return sections.join('\n');
}

/**
 * 기획 문서에서 기능 섹션 파싱 / Parse feature sections from plan document
 *
 * @description
 * KR: "## Features" 섹션 아래의 "### " 헤더를 기능으로 인식한다.
 *     기능 헤더가 없으면 전체 문서를 단일 기능으로 래핑한다.
 * EN: Recognizes "### " headers under "## Features" section as features.
 *     If no feature headers, wraps the entire document as a single feature.
 */
function parseFeaturesFromPlan(plan: string): FeatureSpec[] {
  const featureHeaderRegex = /^###\s+(.+)$/gm;
  const features: FeatureSpec[] = [];
  let match = featureHeaderRegex.exec(plan);
  let index = 0;

  while (match !== null) {
    const featureName = match[1]?.trim() ?? `Feature ${index}`;
    features.push(createMinimalFeatureSpec(`feat-${index}`, featureName));
    index++;
    match = featureHeaderRegex.exec(plan);
  }

  // WHY: 기능 헤더가 없으면 기획 전체를 단일 기능으로 간주
  if (features.length === 0) {
    features.push(createMinimalFeatureSpec('feat-0', 'Main Feature'));
  }

  return features;
}

/**
 * 최소 FeatureSpec 생성 / Create a minimal FeatureSpec
 */
function createMinimalFeatureSpec(id: string, name: string): FeatureSpec {
  return {
    id,
    name,
    description: `Feature: ${name}`,
    acceptanceCriteria: [],
    dependencies: [],
    inputs: [],
    outputs: [],
  };
}
