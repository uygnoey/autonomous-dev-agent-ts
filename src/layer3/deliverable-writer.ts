/**
 * 산출물 파일 작성기 / Deliverable File Writer
 *
 * @description
 * KR: 산출물 콘텐츠를 Markdown 파일로 디스크에 저장한다.
 *     저장 위치: {projectPath}/.adev/deliverables/
 *     Bun.write를 사용하며, Result 패턴을 유지한다.
 *     렌더링 로직은 deliverable-writer-render.ts에 분리.
 *     포맷별 변환 (HTML/PDF/PPTX/DOCX)은 deliverable-format-writers.ts에 분리.
 * EN: Writes deliverable content to disk as Markdown files.
 *     Output location: {projectPath}/.adev/deliverables/
 *     Uses Bun.write with Result pattern.
 *     Rendering logic is in deliverable-writer-render.ts.
 *     Format-specific writers (HTML/PDF/PPTX/DOCX) are in deliverable-format-writers.ts.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { DeliverableMetadata } from 'layer3/deliverable-types.js';
import type { BusinessDeliverableType } from 'layer3/doc-types.js';

// WHY: 렌더링 함수를 re-export하여 기존 import 경로 유지
export { renderDeliverableMarkdown } from 'layer3/deliverable-writer-render.js';

// WHY: 포맷별 writer를 re-export하여 기존 import 경로 유지
export {
  type PdfWriteResult,
  writeDocx,
  writeHtml,
  writePdf,
  writePptx,
} from 'layer3/deliverable-format-writers.js';

import { writeDocx, writeHtml, writePdf, writePptx } from 'layer3/deliverable-format-writers.js';
import { renderDeliverableMarkdown } from 'layer3/deliverable-writer-render.js';

/** 산출물 저장 디렉토리 이름 / Deliverable output directory name */
const DELIVERABLES_DIR = '.adev/deliverables';

/**
 * 포맷에 따라 산출물 파일을 저장한다 / Write deliverable file by format
 *
 * @description
 * KR: pdf/pptx/docx/html 포맷 분기를 중앙화하여 DeliverableBuilder의 300줄 제한을 준수한다.
 * EN: Centralises format dispatch so DeliverableBuilder stays within the 300-line limit.
 *
 * @param format - 파일 포맷 / File format
 * @param outputDir - 출력 디렉토리 / Output directory
 * @param type - 산출물 유형 / Deliverable type
 * @param content - 콘텐츠 / Content
 * @param title - 제목 / Title
 * @param logger - 로거 / Logger
 */
export async function writeDeliverableByFormat(
  format: string,
  outputDir: string,
  type: BusinessDeliverableType,
  content: string,
  title: string,
  logger: Logger,
): Promise<void> {
  if (format === 'pdf') {
    const result = await writePdf(outputDir, type, content, title, logger);
    if (!result.ok) {
      logger.warn('PDF 저장 실패, 마크다운으로 대체', { type, error: result.error.message });
    }
  } else if (format === 'pptx') {
    const result = await writePptx(outputDir, type, content, title, logger);
    if (!result.ok) {
      logger.warn('PPTX 저장 실패', { type, error: result.error.message });
    }
  } else if (format === 'docx') {
    const result = await writeDocx(outputDir, type, content, title, logger);
    if (!result.ok) {
      logger.warn('DOCX 저장 실패', { type, error: result.error.message });
    }
  } else {
    const result = await writeHtml(outputDir, type, content, title, logger);
    if (!result.ok) {
      logger.warn('HTML 저장 실패', { type, error: result.error.message });
    }
  }
}

/**
 * 산출물 파일명 생성 / Generate deliverable filename
 *
 * @param type - 산출물 유형 / Deliverable type
 * @returns 파일명 (확장자 포함) / Filename with extension
 */
function buildFilename(type: BusinessDeliverableType): string {
  return `${type}.md`;
}

/**
 * 산출물을 Markdown 파일로 디스크에 저장한다 / Write deliverable to disk as Markdown
 *
 * @param projectPath - 프로젝트 루트 경로 / Project root path
 * @param type - 산출물 유형 / Deliverable type
 * @param content - 마크다운 콘텐츠 / Markdown content
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function writeDeliverable(
  projectPath: string,
  type: BusinessDeliverableType,
  content: string,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  const outputDir = join(projectPath, DELIVERABLES_DIR);
  const filename = buildFilename(type);
  const filePath = join(outputDir, filename);

  try {
    // WHY: 디렉토리가 없으면 생성 (recursive)
    await mkdir(outputDir, { recursive: true });
    await Bun.write(filePath, content);

    logger.info('산출물 파일 저장 완료', { filePath, type });
    return ok(filePath);
  } catch (cause) {
    const error = new Layer3Error(
      'layer3_deliverable_write_failed',
      `산출물 파일 저장 실패: ${filePath}`,
      cause,
    );
    logger.error('산출물 파일 저장 실패', { filePath, type, error });
    return err(error);
  }
}

/**
 * 산출물을 지정된 디렉토리에 Markdown 파일로 저장한다 / Write deliverable to specified directory
 *
 * @param outputDir - 출력 디렉토리 경로 / Output directory path
 * @param type - 산출물 유형 / Deliverable type
 * @param content - 마크다운 콘텐츠 / Markdown content
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function writeDeliverableToDir(
  outputDir: string,
  type: BusinessDeliverableType,
  content: string,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  const filename = buildFilename(type);
  const filePath = join(outputDir, filename);

  try {
    await mkdir(outputDir, { recursive: true });
    await Bun.write(filePath, content);

    logger.info('산출물 파일 저장 완료', { filePath, type });
    return ok(filePath);
  } catch (cause) {
    const error = new Layer3Error(
      'layer3_deliverable_write_failed',
      `산출물 파일 저장 실패: ${filePath}`,
      cause,
    );
    logger.error('산출물 파일 저장 실패', { filePath, type, error });
    return err(error);
  }
}

/**
 * 모든 기본 산출물을 Markdown 파일로 저장한다 / Write all default deliverables to disk
 *
 * @param projectPath - 프로젝트 루트 경로 / Project root path
 * @param metadata - 산출물 메타데이터 / Deliverable metadata
 * @param types - 산출물 유형 목록 / Deliverable type list
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 목록 / Saved file paths
 */
async function writeAllDeliverables(
  projectPath: string,
  metadata: DeliverableMetadata,
  types: readonly BusinessDeliverableType[],
  logger: Logger,
): Promise<Result<readonly string[], Layer3Error>> {
  const paths: string[] = [];

  for (const type of types) {
    const content = renderDeliverableMarkdown(type, metadata);
    const result = await writeDeliverable(projectPath, type, content, logger);

    if (!result.ok) {
      return err(result.error);
    }

    paths.push(result.value);
  }

  return ok(paths);
}
