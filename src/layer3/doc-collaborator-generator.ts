/**
 * 3단계 협업 문서 생성기 / 3-step collaborative document generator
 *
 * @description
 * KR: §9.2 — 명시적 3단계 협업:
 *     Step 1: Layer1(Claude Opus)에 구조/방향/톤 결정 요청 → 뼈대 생성
 *     Step 2: 결과를 documenter에게 전달하여 기술 상세 채움
 *     Step 3: 완성된 문서를 Layer1에 최종 검토 요청 → 검토 완료 문서 반환
 * EN: §9.2 — Explicit 3-step collaboration pipeline.
 */

import { randomUUID } from 'node:crypto';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { ClaudeApi } from 'layer1/claude-api.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import { callLayer1, callLayer2 } from 'layer3/doc-collaborator-bridge.js';
import type { CollaborativeDocResult } from 'layer3/doc-types.js';
import type {
  BusinessDeliverableType,
  DocumentFragment,
  ProjectDocumentType,
} from 'layer3/doc-types.js';

/** 반복 검토 최대 사이클 수 / Maximum revision cycle count */
const MAX_REVISION_CYCLES = 2;

/** 수정 필요 판정 키워드 / Revision needed keywords */
const REVISION_KEYWORDS = [
  'REVISION_NEEDED',
  'NEEDS_REVISION',
  'REVISE',
  '수정 필요',
  '재작성 필요',
] as const;

/** 최소 문서 길이 (자) / Minimum document quality length (chars) */
const MIN_QUALITY_LENGTH = 500;

/** 최소 섹션 헤더 수 / Minimum section header count */
const MIN_SECTION_COUNT = 1;

/**
 * 문서 품질을 검사한다 / Checks document quality
 */
function checkDocumentQuality(content: string): { passed: boolean; reason?: string } {
  if (content.length < MIN_QUALITY_LENGTH) {
    return {
      passed: false,
      reason: `문서 길이 부족: ${content.length}자 < 최소 ${MIN_QUALITY_LENGTH}자`,
    };
  }
  const sectionCount = (content.match(/^#{1,6}\s/gm) ?? []).length;
  if (sectionCount < MIN_SECTION_COUNT) {
    return {
      passed: false,
      reason: `섹션 헤더 부족: ${sectionCount}개 < 최소 ${MIN_SECTION_COUNT}개`,
    };
  }
  return { passed: true };
}

/**
 * 3단계 협업 문서를 생성한다 / Generate collaborative document via 3-step pipeline
 *
 * @param projectId - 프로젝트 ID / Project ID
 * @param docType - 문서 유형 / Document type
 * @param context - 프로젝트 컨텍스트 / Project context
 * @param fragments - 2계층 조각 문서 / Layer 2 fragment documents
 * @param outputPath - 출력 경로 / Output path
 * @param claudeApi - Claude API 클라이언트 / Claude API client
 * @param documenterSpawner - 2계층 documenter 스포너 / Layer 2 documenter spawner
 * @param logger - 로거 / Logger
 * @returns 완성된 협업 문서 / Completed collaborative document
 */
export async function generateCollaborativeDoc(
  projectId: string,
  docType: ProjectDocumentType | BusinessDeliverableType,
  context: string,
  fragments: readonly DocumentFragment[],
  outputPath: string,
  claudeApi: ClaudeApi | null,
  documenterSpawner: AgentSpawner | null,
  logger: Logger,
): Promise<Result<CollaborativeDocResult>> {
  logger.info('3단계 협업 문서 생성 시작', { projectId, docType });

  if (!claudeApi) {
    return err(
      new AgentError('agent_not_configured', '3단계 협업 문서 생성에는 Claude API가 필요합니다'),
    );
  }

  // Step 1: Layer1에 구조/방향/톤 결정 요청
  logger.info('Step 1: Layer1 구조 생성 요청', { docType });
  const structureResult = await callLayer1(claudeApi, {
    type: 'create-structure',
    docType,
    context,
  });
  if (!structureResult.ok) {
    return err(structureResult.error);
  }
  const structure = structureResult.value.content;
  logger.info('Step 1 완료: Layer1 뼈대 생성', { structureLength: structure.length });

  // Step 2: documenter에게 기술 상세 채움 요청
  let details: string;
  if (documenterSpawner) {
    logger.info('Step 2: Layer2 documenter 기술 상세 작성 요청', { docType });
    const detailResult = await callLayer2(documenterSpawner, {
      docType,
      structure,
      fragments,
    });
    if (!detailResult.ok) {
      logger.warn('Step 2 실패: L1 뼈대만으로 진행', {
        error: detailResult.error.message,
      });
      details = structure;
    } else {
      details = detailResult.value.content;
      logger.info('Step 2 완료: Layer2 상세 작성', { detailsLength: details.length });
    }
  } else {
    logger.info('Step 2: spawner 없음 — 조각 직접 병합');
    const fragContent = fragments.map((f) => f.content).join('\n\n');
    details = fragContent ? `${structure}\n\n---\n\n${fragContent}` : structure;
  }

  // WHY: 품질 게이트 — 최소 길이와 섹션 구조를 충족해야 Step3 진행
  const qualityCheck = checkDocumentQuality(details);
  if (!qualityCheck.passed) {
    logger.warn('Step 2 품질 게이트 미달 — revision 강제', {
      reason: qualityCheck.reason,
      detailsLength: details.length,
    });
  }
  let forceRevision = !qualityCheck.passed;

  // Step 3: Layer1 최종 검토 + 수정 필요 시 반복
  let finalContent = details;
  let cycleDetails = details;

  for (let cycle = 0; cycle < MAX_REVISION_CYCLES; cycle++) {
    logger.info(`Step 3 (cycle ${cycle + 1}/${MAX_REVISION_CYCLES}): Layer1 최종 검토 요청`, {
      docType,
    });

    const reviewResult = await callLayer1(claudeApi, {
      type: 'review-and-refine',
      docType,
      context: structure,
      layer2Details: cycleDetails,
    });

    if (!reviewResult.ok) {
      logger.warn(`Step 3 cycle ${cycle + 1} 실패: 현재 버전으로 fallback`, {
        error: reviewResult.error.message,
      });
      finalContent = cycleDetails;
      break;
    }

    const reviewContent = reviewResult.value.content;
    const upperContent = reviewContent.toUpperCase();
    const needsRevision =
      forceRevision || REVISION_KEYWORDS.some((kw) => upperContent.includes(kw));
    forceRevision = false;

    if (!needsRevision) {
      finalContent = reviewContent;
      logger.info(`Step 3 cycle ${cycle + 1} 완료: 검토 통과`, {
        finalLength: finalContent.length,
      });
      break;
    }

    logger.info(`Step 3 cycle ${cycle + 1}: 수정 필요 판정 — Step2 재실행`, {
      cycle: cycle + 1,
    });
    finalContent = reviewContent;

    if (cycle < MAX_REVISION_CYCLES - 1 && documenterSpawner) {
      const redetailResult = await callLayer2(documenterSpawner, {
        docType,
        structure: reviewContent,
        fragments,
      });
      if (redetailResult.ok) {
        cycleDetails = redetailResult.value.content;
        logger.info(`Step2 재실행 완료 (cycle ${cycle + 1})`, {
          detailsLength: cycleDetails.length,
        });
      }
    }
  }

  logger.info('3단계 협업 문서 생성 완료', {
    projectId,
    docType,
    finalLength: finalContent.length,
  });

  return ok({
    id: randomUUID(),
    content: finalContent,
    outputPath,
    generatedAt: new Date(),
  });
}
