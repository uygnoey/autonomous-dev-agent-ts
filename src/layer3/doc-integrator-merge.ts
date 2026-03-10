/**
 * 문서 통합 병합 헬퍼 / Document integration merge helpers
 *
 * @description
 * KR: DocIntegrator에서 분리된 동기/비동기 통합 병합 로직을 제공한다.
 * EN: Provides sync/async integration merge logic extracted from DocIntegrator.
 */

import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { IntegrateOptions } from 'layer3/doc-integrator-types.js';
import type {
  DocumentFragment,
  DocumentTemplate,
  IntegratedDocument,
  ProjectDocumentType,
} from 'layer3/types.js';

/**
 * IntegrateOptions 기반 비동기 통합 / Async integration with IntegrateOptions
 *
 * @param options - 통합 옵션 / Integration options
 * @param collectFragmentsFn - 조각 수집 함수 / Fragment collection function
 * @param docCounter - 문서 카운터 (증가 전달) / Document counter (passed by ref via object)
 * @param logger - 로거 / Logger
 * @returns 통합 문서 결과 / Integrated document result
 */
export async function integrateWithOptions(
  options: IntegrateOptions,
  collectFragmentsFn: (
    projectId: string,
    pattern: string,
  ) => Promise<Result<readonly DocumentFragment[], Layer3Error>>,
  docCounterRef: { value: number },
  logger: Logger,
): Promise<Result<IntegratedDocument, Layer3Error>> {
  const { projectId: pid, type, fragmentPattern, outputPath } = options;

  if (!pid || pid.trim() === '') {
    logger.error('프로젝트 ID 검증 실패', { projectId: pid });
    return err(new Layer3Error('layer3_invalid_project_id', '프로젝트 ID가 비어 있음'));
  }

  logger.info('옵션 기반 문서 통합 시작', { projectId: pid, type, fragmentPattern });

  // WHY: collectFragments로 실제 파일 수집 시도
  const collectResult = await collectFragmentsFn(pid, fragmentPattern);
  const fragmentIds: string[] = collectResult.ok ? collectResult.value.map((f) => f.id) : [];

  docCounterRef.value += 1;
  const doc: IntegratedDocument = {
    id: `doc-${docCounterRef.value}`,
    projectId: pid,
    type,
    content: `# ${type}\n\nGenerated document for ${pid}.\nOutput: ${outputPath}`,
    generatedAt: new Date(),
    version: 1,
    sourceFragments: fragmentIds,
  };

  logger.info('옵션 기반 문서 통합 완료', { docId: doc.id, projectId: pid, type });
  return ok(doc);
}

/**
 * 동기 3인자 통합 / Sync 3-argument integration
 *
 * @param fragments - 조각 목록 / Fragment list
 * @param template - 문서 템플릿 / Document template
 * @param projectId - 프로젝트 ID / Project ID
 * @param docCounterRef - 문서 카운터 참조 / Document counter reference
 * @param logger - 로거 / Logger
 * @returns 통합 문서 결과 / Integrated document result
 */
export function integrateSync(
  fragments: readonly string[],
  template: DocumentTemplate,
  projectId: string,
  docCounterRef: { value: number },
  logger: Logger,
): Result<IntegratedDocument, Layer3Error> {
  // WHY: 입력 검증 - 빈 조각
  if (!fragments || fragments.length === 0) {
    logger.error('빈 조각 문서 목록', { projectId });
    return err(new Layer3Error('layer3_empty_fragments', '조각 문서 목록이 비어 있습니다'));
  }

  // WHY: 입력 검증 - 빈 섹션
  if (!template.sections || template.sections.length === 0) {
    logger.error('빈 템플릿 섹션', { projectId });
    return err(new Layer3Error('layer3_empty_template_sections', '템플릿 섹션이 비어 있습니다'));
  }

  logger.info('문서 통합 시작', { projectId, fragmentCount: fragments.length });

  // WHY: 템플릿 기반 콘텐츠 생성
  const title = template.title ?? 'Untitled';
  const sectionContents = template.sections
    .map((s) => `## ${s.heading}\n\n${s.content}`)
    .join('\n\n');
  const content = `# ${title}\n\n${sectionContents}`;

  docCounterRef.value += 1;
  const doc: IntegratedDocument = {
    id: `doc-${docCounterRef.value}`,
    projectId,
    type: (template.type as ProjectDocumentType) ?? 'readme',
    content,
    generatedAt: new Date(),
    version: 1,
    sourceFragments: [...fragments],
  };

  logger.info('문서 통합 완료', {
    docId: doc.id,
    projectId,
    fragmentCount: fragments.length,
  });

  return ok(doc);
}
