/**
 * PDF 렌더러 / PDF Renderer
 *
 * @description
 * KR: pdfkit을 사용하여 마크다운 콘텐츠를 텍스트 기반 PDF로 변환한다.
 *     헤더/본문 폰트 구분, 리스트 들여쓰기, 페이지 나누기를 지원한다.
 *     실패 시 HTML fallback 경로를 반환한다.
 * EN: Converts markdown content to text-based PDF using pdfkit.
 *     Supports header/body font distinction, list indentation, and page breaks.
 *     Returns HTML fallback path on failure.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { BusinessDeliverableType } from 'layer3/doc-types.js';
import PDFDocument from 'pdfkit';

/** PDF 문서 옵션 / PDF document options */
export interface PdfDocumentOptions {
  /** 문서 제목 / Document title */
  readonly title: string;
  /** 저자 / Author */
  readonly author?: string;
  /** 페이지 크기 / Page size */
  readonly pageSize?: 'A4' | 'LETTER';
}

/** 인용문 텍스트 색상 / Blockquote text color */
const BLOCKQUOTE_COLOR = '#666666';

/** 본문 텍스트 색상 / Body text color */
const BODY_TEXT_COLOR = '#333333';

/** 수평선 색상 / Horizontal rule color */
const HR_COLOR = '#cccccc';

/** 푸터 텍스트 색상 / Footer text color */
const FOOTER_COLOR = '#999999';

/** PDF 폰트 설정 상수 / PDF font configuration constants */
const PDF_FONTS = {
  TITLE_SIZE: 24,
  H1_SIZE: 20,
  H2_SIZE: 16,
  H3_SIZE: 14,
  BODY_SIZE: 11,
  SMALL_SIZE: 9,
  LINE_GAP: 4,
  PARAGRAPH_GAP: 8,
  HEADING_GAP: 14,
  LIST_INDENT: 20,
  PAGE_MARGIN: 50,
} as const;

/**
 * 마크다운 라인을 파싱하여 PDF 요소로 변환 / Parse markdown lines into PDF elements
 *
 * @param lines - 마크다운 라인 배열 / Markdown line array
 * @param doc - PDFDocument 인스턴스 / PDFDocument instance
 */
function renderLinesToPdf(lines: readonly string[], doc: PDFKit.PDFDocument): void {
  let inCodeBlock = false;

  for (const rawLine of lines) {
    const line = rawLine;

    // WHY: 코드 블록 토글 처리
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        doc.moveDown(0.5);
      } else {
        doc.moveDown(0.5);
      }
      continue;
    }

    // WHY: 코드 블록 내부는 고정폭 폰트로 렌더링
    if (inCodeBlock) {
      doc
        .font('Courier')
        .fontSize(PDF_FONTS.SMALL_SIZE)
        .text(line, { indent: PDF_FONTS.LIST_INDENT });
      continue;
    }

    // 빈 행 / Empty line
    if (line.trim() === '') {
      doc.moveDown(0.5);
      continue;
    }

    // 수평선 / Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      doc.moveDown(0.5);
      const currentY = doc.y;
      doc
        .moveTo(PDF_FONTS.PAGE_MARGIN, currentY)
        .lineTo(doc.page.width - PDF_FONTS.PAGE_MARGIN, currentY)
        .stroke(HR_COLOR);
      doc.moveDown(0.5);
      continue;
    }

    // 제목 / Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = (headingMatch[1] ?? '').length;
      const text = stripInlineMarkdown(headingMatch[2] ?? '');
      const fontSize =
        level === 1 ? PDF_FONTS.H1_SIZE : level === 2 ? PDF_FONTS.H2_SIZE : PDF_FONTS.H3_SIZE;

      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(fontSize).text(text);
      doc.moveDown(0.3);
      continue;
    }

    // 인용문 / Blockquote
    if (line.startsWith('>')) {
      const text = stripInlineMarkdown(line.replace(/^>\s?/, ''));
      doc
        .font('Helvetica-Oblique')
        .fontSize(PDF_FONTS.BODY_SIZE)
        .fillColor(BLOCKQUOTE_COLOR)
        .text(text, { indent: PDF_FONTS.LIST_INDENT })
        .fillColor(BODY_TEXT_COLOR);
      continue;
    }

    // 비순서 리스트 / Unordered list
    if (/^[-*+]\s/.test(line)) {
      const text = stripInlineMarkdown(line.replace(/^[-*+]\s/, ''));
      doc
        .font('Helvetica')
        .fontSize(PDF_FONTS.BODY_SIZE)
        .text(`\u2022  ${text}`, { indent: PDF_FONTS.LIST_INDENT });
      continue;
    }

    // 순서 리스트 / Ordered list
    const orderedMatch = line.match(/^(\d+)\.\s(.+)$/);
    if (orderedMatch) {
      const num = orderedMatch[1] ?? '';
      const text = stripInlineMarkdown(orderedMatch[2] ?? '');
      doc
        .font('Helvetica')
        .fontSize(PDF_FONTS.BODY_SIZE)
        .text(`${num}.  ${text}`, { indent: PDF_FONTS.LIST_INDENT });
      continue;
    }

    // 일반 문단 / Paragraph
    doc
      .font('Helvetica')
      .fontSize(PDF_FONTS.BODY_SIZE)
      .text(stripInlineMarkdown(line), { lineGap: PDF_FONTS.LINE_GAP });
  }
}

/**
 * 마크다운 인라인 서식을 제거 / Strip inline markdown formatting
 *
 * @param text - 마크다운 텍스트 / Markdown text
 * @returns 서식 제거된 텍스트 / Stripped text
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * 마크다운을 PDF 파일로 렌더링하여 저장 / Render markdown to PDF file
 *
 * @param markdown - 마크다운 콘텐츠 / Markdown content
 * @param outputPath - PDF 출력 경로 / PDF output path
 * @param options - PDF 문서 옵션 / PDF document options
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function renderMarkdownToPdf(
  markdown: string,
  outputPath: string,
  options: PdfDocumentOptions,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  try {
    const outputDir = join(outputPath, '..');
    await mkdir(outputDir, { recursive: true });

    const doc = new PDFDocument({
      size: options.pageSize ?? 'A4',
      margins: {
        top: PDF_FONTS.PAGE_MARGIN,
        bottom: PDF_FONTS.PAGE_MARGIN,
        left: PDF_FONTS.PAGE_MARGIN,
        right: PDF_FONTS.PAGE_MARGIN,
      },
      info: {
        Title: options.title,
        Author: options.author ?? 'adev',
        Creator: 'adev deliverable-pdf-renderer',
      },
    });

    // WHY: Bun 환경에서 스트림을 버퍼로 수집 후 Bun.write로 저장
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<void>((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    // WHY: 타이틀 페이지 헤더
    doc
      .font('Helvetica-Bold')
      .fontSize(PDF_FONTS.TITLE_SIZE)
      .text(options.title, { align: 'center' });
    doc.moveDown(1);

    // WHY: 본문 렌더링
    const lines = markdown.split('\n');
    renderLinesToPdf(lines, doc);

    // WHY: 푸터에 생성 시각 표시
    doc.moveDown(2);
    doc
      .font('Helvetica')
      .fontSize(PDF_FONTS.SMALL_SIZE)
      .fillColor(FOOTER_COLOR)
      .text(`Generated at ${new Date().toISOString()}`, { align: 'right' })
      .fillColor(BODY_TEXT_COLOR);

    doc.end();
    await finished;

    const pdfBuffer = Buffer.concat(chunks);
    await Bun.write(outputPath, pdfBuffer);

    logger.info('PDF 파일 생성 완료', { outputPath });
    return ok(outputPath);
  } catch (cause) {
    const error = new Layer3Error(
      'layer3_pdf_render_failed',
      `PDF 렌더링 실패: ${outputPath}`,
      cause,
    );
    logger.error('PDF 렌더링 실패', { outputPath, error });
    return err(error);
  }
}

/**
 * 산출물 유형에 맞는 PDF 파일을 생성 / Generate PDF file for deliverable type
 *
 * @param projectPath - 프로젝트 루트 경로 / Project root path
 * @param type - 산출물 유형 / Deliverable type
 * @param markdownContent - 마크다운 콘텐츠 / Markdown content
 * @param title - 문서 제목 / Document title
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 PDF 파일 경로 / Saved PDF file path
 */
export async function writeDeliverableAsPdf(
  projectPath: string,
  type: BusinessDeliverableType,
  markdownContent: string,
  title: string,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  const outputDir = join(projectPath, '.adev', 'deliverables');
  const outputPath = join(outputDir, `${type}.pdf`);

  return renderMarkdownToPdf(markdownContent, outputPath, { title }, logger);
}
