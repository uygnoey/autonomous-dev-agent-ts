/**
 * 문서 협업기 브리지 / Document Collaborator Bridge
 *
 * @description
 * KR: 1계층(Claude API) 및 2계층(documenter spawner)과의 통신 로직을 분리한 모듈.
 *     DocCollaborator에서 호출되는 Layer1/Layer2 요청 함수를 제공한다.
 * EN: Module separating communication logic with Layer 1 (Claude API) and Layer 2 (documenter spawner).
 *     Provides Layer1/Layer2 request functions called by DocCollaborator.
 */

import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { ClaudeApi } from 'layer1/claude-api.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { AgentConfig } from 'layer2/types.js';
import type { CollabDocState } from 'layer3/doc-collaborator-types.js';
import type {
  Layer1Request,
  Layer1Response,
  Layer2Request,
  Layer2Response,
} from 'layer3/doc-collaborator-types.js';
import type { CollaborativeDocOptions, CollaborativeDocResult } from 'layer3/doc-types.js';

/**
 * 1계층(Claude Opus)에 뼈대 생성 또는 최종 검토를 요청한다.
 * Request Layer 1 (Claude Opus) to create structure or review.
 *
 * @param claudeApi - Claude API 클라이언트 / Claude API client
 * @param request - 1계층 요청 / Layer 1 request
 * @returns 1계층 응답 Result / Layer 1 response Result
 */
export async function callLayer1(
  claudeApi: ClaudeApi,
  request: Layer1Request,
): Promise<Result<Layer1Response>> {
  try {
    let prompt: string;

    if (request.type === 'create-structure') {
      prompt = `다음 프로젝트의 ${request.docType} 문서 뼈대를 작성해주세요.\n\n컨텍스트: ${request.context}`;
    } else {
      if (!request.layer2Details) {
        return err(
          new AgentError(
            'agent_invalid_request',
            'review-and-refine 요청 시 layer2Details가 필요합니다',
          ),
        );
      }
      prompt = `다음 문서를 최종 검토하고 다듬어주세요.\n\n${request.layer2Details}`;
    }

    const result = await claudeApi.createMessage([{ role: 'user', content: prompt }], {
      maxTokens: 8192,
      temperature: 0.7,
    });

    if (!result.ok) {
      return err(
        new AgentError(
          'agent_layer1_request_failed',
          `1계층 요청 실패: ${result.error.message}`,
          result.error,
        ),
      );
    }

    const responseType = request.type === 'create-structure' ? 'structure' : 'refined';
    return ok({ type: responseType, content: result.value.content });
  } catch (error: unknown) {
    return err(
      new AgentError(
        'agent_layer1_request_failed',
        `1계층 요청 중 예외 발생: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    );
  }
}

/**
 * 2계층 documenter에 상세 내용 작성을 요청한다.
 * Request Layer 2 documenter to fill in implementation details.
 *
 * @param documenterSpawner - 2계층 documenter 스포너 / Layer 2 documenter spawner
 * @param request - 2계층 요청 / Layer 2 request
 * @returns 2계층 응답 Result / Layer 2 response Result
 */
export async function callLayer2(
  documenterSpawner: AgentSpawner,
  request: Layer2Request,
): Promise<Result<Layer2Response>> {
  try {
    const fragmentsContext = request.fragments
      .map((frag) => `[${frag.type}] ${frag.id}:\n${frag.content}`)
      .join('\n\n---\n\n');

    const prompt = `다음 문서 뼈대에 구현 상세를 채워넣으세요.\n\n## 뼈대:\n\n${request.structure}\n\n## 조각 문서:\n\n${fragmentsContext || '(조각 문서 없음)'}`;

    const agentConfig: AgentConfig = {
      name: 'documenter',
      projectId: 'collab-doc',
      featureId: `doc-${request.docType}`,
      phase: 'VERIFY',
      systemPrompt: '당신은 기술 문서 작성 전문가입니다.',
      prompt,
      tools: ['read', 'grep', 'glob'],
      maxTurns: 20,
    };

    let content = '';
    for await (const event of documenterSpawner.spawn(agentConfig)) {
      if (event.type === 'message') {
        content += event.content;
      }
    }

    if (!content.trim()) {
      return err(
        new AgentError('agent_layer2_request_failed', '2계층 documenter가 빈 내용을 반환했습니다'),
      );
    }

    const headingMatches = content.match(/^#{1,6}\s+.+$/gm) ?? [];
    const filledSections = headingMatches.map((h) => h.trim());

    return ok({ content, filledSections });
  } catch (error: unknown) {
    return err(
      new AgentError(
        'agent_layer2_request_failed',
        `2계층 요청 중 예외 발생: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    );
  }
}

/**
 * 마크다운 문서에서 목차를 생성한다 / Generate table of contents from markdown content
 *
 * @param content - 문서 내용 / Document content
 * @returns 목차 문자열 Result / Table of contents string Result
 */
export function generateToc(content: string): Result<string> {
  if (!content || content.trim() === '') {
    return err(new AgentError('agent_invalid_input', '문서 내용이 비어 있습니다'));
  }

  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  const headings: { level: number; text: string }[] = [];

  for (
    let match = headingPattern.exec(content);
    match !== null;
    match = headingPattern.exec(content)
  ) {
    const level = match[1]?.length ?? 1;
    const text = match[2]?.trim() ?? '';
    if (text) {
      headings.push({ level, text });
    }
  }

  if (headings.length === 0) {
    return ok('## 목차\n\n(내용 없음)');
  }

  const tocLines = headings.map((h) => {
    const indent = '  '.repeat(h.level - 1);
    return `${indent}- ${h.text}`;
  });

  return ok(`## 목차\n\n${tocLines.join('\n')}`);
}

/**
 * 전체 협업 파이프라인을 실행한다 / Run the full collaboration pipeline
 *
 * @description
 * KR: Layer1 구조 → Layer2 상세 → Layer1 검토 순서로 실행.
 *     claudeApi/spawner가 없으면 제공된 값으로 fallback.
 * EN: Runs L1 structure → L2 details → L1 review in order.
 *     Falls back to provided values when claudeApi/spawner is absent.
 *
 * @param options - 협업 문서 옵션 / Collaborative document options
 * @param claudeApi - Claude API (nullable) / Claude API (nullable)
 * @param spawner - documenter spawner (nullable) / documenter spawner (nullable)
 * @param stateStore - 상태 저장소 / State store
 * @param docId - 문서 ID / Document ID
 * @param logger - 로거 / Logger
 * @returns 협업 문서 결과 Result / Collaborative document result Result
 */
export async function runCollaborationPipeline(
  options: CollaborativeDocOptions,
  claudeApi: ClaudeApi | null,
  spawner: AgentSpawner | null,
  stateStore: Map<string, CollabDocState>,
  docId: string,
  logger: Logger,
): Promise<Result<CollaborativeDocResult>> {
  // 1. Layer1 구조 생성 / Generate structure via Layer1
  let structure: string;
  if (claudeApi) {
    const l1StructResult = await callLayer1(claudeApi, {
      type: 'create-structure',
      docType: options.type,
      context: options.layer1Structure,
    });
    structure = l1StructResult.ok ? l1StructResult.value.content : options.layer1Structure;
  } else {
    structure = options.layer1Structure;
  }

  // WHY: 구조 완료 후 detail 단계로 전환
  const afterStructure = stateStore.get(docId);
  if (afterStructure) {
    stateStore.set(docId, { ...afterStructure, structure, phase: 'detail', updatedAt: new Date() });
  }

  // 2. Layer2 상세 작성 또는 조각 병합 fallback
  // WHY: §9.2 — "2계층 documenter: 구현 상세 채워넣기 (코드/테스트를 아니까) → 기술적 내용 작성"
  let details: string;
  let finalContent: string;
  if (spawner) {
    const l2Result = await callLayer2(spawner, {
      docType: options.type,
      structure,
      fragments: options.layer2Fragments,
    });

    if (l2Result.ok) {
      details = l2Result.value.content;

      // WHY: §9.2 — "1계층: 최종 검토 + 다듬기 → 완성"
      if (claudeApi) {
        const l1RefineResult = await callLayer1(claudeApi, {
          type: 'review-and-refine',
          docType: options.type,
          context: structure,
          layer2Details: details,
        });
        finalContent = l1RefineResult.ok ? l1RefineResult.value.content : details;
      } else {
        finalContent = details;
      }
    } else {
      details = '';
      finalContent = structure;
    }
  } else {
    // WHY: spawner 없을 때 조각 내용을 직접 병합
    const fragContent = options.layer2Fragments.map((f) => f.content).join('\n\n');
    details = fragContent;
    finalContent = fragContent ? `${structure}\n\n---\n\n${fragContent}` : structure;
  }

  // WHY: detail 단계 상태에 details 필드 추가 후 review 단계로 전환
  const afterDetail = stateStore.get(docId);
  if (afterDetail) {
    stateStore.set(docId, {
      ...afterDetail,
      details,
      phase: 'review',
      finalContent,
      updatedAt: new Date(),
    });
  }

  logger.info('협업 파이프라인 완료', { docId, finalContentLength: finalContent.length });
  return ok({
    id: docId,
    content: finalContent,
    outputPath: options.outputPath,
    generatedAt: new Date(),
  });
}
