/**
 * 산출물 포맷별 파일 작성기 / Deliverable format-specific file writers
 *
 * @description
 * KR: HTML, PDF, PPTX, DOCX 포맷으로 산출물을 변환하여 디스크에 저장한다.
 *     각 포맷별 실패 시 fallback 전략을 포함한다.
 * EN: Converts deliverables to HTML, PDF, PPTX, DOCX formats and writes to disk.
 *     Includes fallback strategies for each format failure.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import { writeDeliverableAsDocx } from 'layer3/deliverable-docx-renderer.js';
import { markdownToHtml } from 'layer3/deliverable-html-renderer.js';
import { writeDeliverableAsPdf } from 'layer3/deliverable-pdf-renderer.js';
import { writeDeliverableAsPptx } from 'layer3/deliverable-pptx-renderer.js';
import type { BusinessDeliverableType } from 'layer3/doc-types.js';

/** 산출물 저장 디렉토리 이름 / Deliverable output directory name */
const DELIVERABLES_DIR = '.adev/deliverables';

/**
 * PDF 저장 결과 / PDF write result
 */
export interface PdfWriteResult {
  /** PDF 파일 경로 (성공 시) / PDF file path (on success) */
  readonly pdfPath: string | null;
  /** HTML fallback 파일 경로 (PDF 실패 시) / HTML fallback path (on PDF failure) */
  readonly fallbackHtmlPath: string | null;
}

/**
 * 마크다운 산출물을 HTML 파일로 변환하여 저장한다 / Convert markdown deliverable to HTML and write to disk
 *
 * @param projectPath - 프로젝트 루트 경로 / Project root path
 * @param type - 산출물 유형 / Deliverable type
 * @param markdownContent - 마크다운 콘텐츠 / Markdown content
 * @param title - HTML 문서 제목 / HTML document title
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function writeHtml(
  projectPath: string,
  type: BusinessDeliverableType,
  markdownContent: string,
  title: string,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  const outputDir = join(projectPath, DELIVERABLES_DIR);
  const filename = `${type}.html`;
  const filePath = join(outputDir, filename);

  try {
    await mkdir(outputDir, { recursive: true });

    const htmlContent = markdownToHtml(markdownContent, { title });
    await Bun.write(filePath, htmlContent);

    logger.info('HTML 산출물 파일 저장 완료', { filePath, type });
    return ok(filePath);
  } catch (cause) {
    const error = new Layer3Error(
      'layer3_deliverable_write_failed',
      `HTML 산출물 파일 저장 실패: ${filePath}`,
      cause,
    );
    logger.error('HTML 산출물 파일 저장 실패', { filePath, type, error });
    return err(error);
  }
}

/**
 * 마크다운 산출물을 PDF 파일로 변환하여 저장한다 / Convert markdown deliverable to PDF and write to disk
 *
 * @description
 * KR: pdfkit을 사용하여 마크다운을 텍스트 기반 PDF로 변환한다.
 *     PDF 생성 실패 시 HTML fallback 파일을 생성한다.
 * EN: Converts markdown to text-based PDF using pdfkit.
 *     Creates HTML fallback file if PDF generation fails.
 *
 * @param projectPath - 프로젝트 루트 경로 / Project root path
 * @param type - 산출물 유형 / Deliverable type
 * @param markdownContent - 마크다운 콘텐츠 / Markdown content
 * @param title - 문서 제목 / Document title
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns PDF 저장 결과 (PDF 경로 또는 HTML fallback 경로) / PDF write result
 */
export async function writePdf(
  projectPath: string,
  type: BusinessDeliverableType,
  markdownContent: string,
  title: string,
  logger: Logger,
): Promise<Result<PdfWriteResult, Layer3Error>> {
  // WHY: pdfkit으로 실제 PDF 생성 시도
  const pdfResult = await writeDeliverableAsPdf(projectPath, type, markdownContent, title, logger);

  if (pdfResult.ok) {
    return ok({
      pdfPath: pdfResult.value,
      fallbackHtmlPath: null,
    });
  }

  // WHY: PDF 생성 실패 시 HTML fallback
  logger.warn('PDF 생성 실패, HTML fallback 생성', { type, error: pdfResult.error.message });
  const htmlResult = await writeHtml(projectPath, type, markdownContent, title, logger);

  if (!htmlResult.ok) {
    return err(htmlResult.error);
  }

  return ok({
    pdfPath: null,
    fallbackHtmlPath: htmlResult.value,
  });
}

/**
 * 마크다운 산출물을 PPTX 파일로 변환하여 저장한다 / Convert markdown deliverable to PPTX and write to disk
 *
 * @param projectPath - 출력 디렉토리 경로 / Output directory path
 * @param type - 산출물 유형 / Deliverable type
 * @param markdownContent - 마크다운 콘텐츠 / Markdown content
 * @param title - 문서 제목 / Document title
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function writePptx(
  projectPath: string,
  type: BusinessDeliverableType,
  markdownContent: string,
  title: string,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  const outputDir = join(projectPath, DELIVERABLES_DIR);
  const pptxResult = await writeDeliverableAsPptx(outputDir, type, markdownContent, title, logger);
  if (pptxResult.ok) return pptxResult;

  // WHY: PPTX 실패 시 HTML fallback
  logger.warn('PPTX 생성 실패, HTML fallback 생성', { type, error: pptxResult.error.message });
  const filePath = join(outputDir, `${type}.html`);
  try {
    await mkdir(outputDir, { recursive: true });
    const htmlContent = markdownToHtml(markdownContent, { title });
    await Bun.write(filePath, htmlContent);
    logger.info('PPTX fallback HTML 저장 완료', { filePath, type });
    return ok(filePath);
  } catch (cause) {
    return err(
      new Layer3Error(
        'layer3_deliverable_write_failed',
        `PPTX fallback 저장 실패: ${filePath}`,
        cause,
      ),
    );
  }
}

/**
 * 마크다운 산출물을 DOCX 파일로 변환하여 저장한다 / Convert markdown deliverable to DOCX and write to disk
 *
 * @param projectPath - 출력 디렉토리 경로 / Output directory path
 * @param type - 산출물 유형 / Deliverable type
 * @param markdownContent - 마크다운 콘텐츠 / Markdown content
 * @param title - 문서 제목 / Document title
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function writeDocx(
  projectPath: string,
  type: BusinessDeliverableType,
  markdownContent: string,
  title: string,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  const outputDir = join(projectPath, DELIVERABLES_DIR);
  const docxResult = await writeDeliverableAsDocx(outputDir, type, markdownContent, title, logger);
  if (docxResult.ok) return docxResult;

  // WHY: DOCX 실패 시 Markdown fallback
  logger.warn('DOCX 생성 실패, Markdown fallback 생성', { type, error: docxResult.error.message });
  const mdFilePath = join(outputDir, `${type}.md`);
  try {
    await mkdir(outputDir, { recursive: true });
    await Bun.write(mdFilePath, markdownContent);
    logger.info('DOCX fallback Markdown 저장 완료', { filePath: mdFilePath, type });
    return ok(mdFilePath);
  } catch (cause) {
    return err(
      new Layer3Error(
        'layer3_deliverable_write_failed',
        `DOCX fallback 저장 실패: ${mdFilePath}`,
        cause,
      ),
    );
  }
}
