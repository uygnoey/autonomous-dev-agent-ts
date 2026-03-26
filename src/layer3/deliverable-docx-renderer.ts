/**
 * DOCX 렌더러 / DOCX Renderer
 *
 * @description
 * KR: docx 패키지를 사용하여 마크다운 콘텐츠를 Word 문서(.docx)로 변환한다.
 *     H1 → Heading1, H2 → Heading2, H3 → Heading3, 목록 → 불릿 리스트로 변환한다.
 *     실패 시 Layer3Error를 Result 패턴으로 반환한다.
 * EN: Converts markdown content to Word document (.docx) using the docx package.
 *     H1 → Heading1, H2 → Heading2, H3 → Heading3, lists → bullet lists.
 *     Returns Layer3Error via Result pattern on failure.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from 'docx';
import type { BusinessDeliverableType } from 'layer3/doc-types.js';

/** 브랜드 색상 코드 / Brand color hex code */
const BRAND_COLOR_HEX = '1F3864';

/** docx 폰트 설정 상수 / docx font configuration constants */
const DOCX_FONTS = {
  TITLE_SIZE: 56,
  H1_SIZE: 48,
  H2_SIZE: 40,
  H3_SIZE: 32,
  BODY_SIZE: 24,
  CODE_SIZE: 20,
} as const;

/** docx 단락 / Paragraph type alias */
type DocParagraph = Paragraph;

/**
 * 마크다운 라인을 docx Paragraph 목록으로 변환 / Convert markdown lines to docx Paragraph list
 *
 * @param lines - 마크다운 라인 배열 / Markdown line array
 * @returns docx Paragraph 배열 / docx Paragraph array
 */
function parseMarkdownToParagraphs(lines: readonly string[]): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];
  let inCodeBlock = false;
  const codeLines: string[] = [];

  const flushCodeBlock = (): void => {
    if (codeLines.length === 0) return;
    for (const codeLine of codeLines) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: codeLine || ' ',
              font: 'Courier New',
              size: DOCX_FONTS.CODE_SIZE,
            }),
          ],
          spacing: { before: 0, after: 60 },
        }),
      );
    }
    codeLines.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }),
      );
    } else if (line.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        }),
      );
    } else if (line.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }),
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line.slice(2), size: DOCX_FONTS.BODY_SIZE })],
          bullet: { level: 0 },
          spacing: { before: 60, after: 60 },
        }),
      );
    } else if (line.startsWith('  - ') || line.startsWith('  * ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line.slice(4), size: DOCX_FONTS.BODY_SIZE })],
          bullet: { level: 1 },
          spacing: { before: 40, after: 40 },
        }),
      );
    } else if (line.startsWith('---') || line.startsWith('___')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: '', size: DOCX_FONTS.BODY_SIZE })],
          spacing: { before: 200, after: 200 },
          border: { bottom: { style: 'single', size: 6, color: 'AAAAAA', space: 1 } },
        }),
      );
    } else if (line.trim() === '') {
      paragraphs.push(new Paragraph({ children: [], spacing: { before: 80, after: 80 } }));
    } else {
      // WHY: **bold**, *italic* 기본 파싱
      const runs = parseBoldItalicRuns(line);
      paragraphs.push(
        new Paragraph({
          children: runs,
          spacing: { before: 80, after: 80 },
          alignment: AlignmentType.LEFT,
        }),
      );
    }
  }

  flushCodeBlock();
  return paragraphs;
}

/**
 * **bold** / *italic* 패턴을 TextRun 배열로 파싱 / Parse bold/italic patterns into TextRun array
 *
 * @param line - 마크다운 라인 / Markdown line
 * @returns TextRun 배열 / TextRun array
 */
function parseBoldItalicRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  // WHY: **bold** 패턴을 먼저 처리
  const segments = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);

  for (const segment of segments) {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      runs.push(
        new TextRun({ text: segment.slice(2, -2), bold: true, size: DOCX_FONTS.BODY_SIZE }),
      );
    } else if (segment.startsWith('*') && segment.endsWith('*')) {
      runs.push(
        new TextRun({ text: segment.slice(1, -1), italics: true, size: DOCX_FONTS.BODY_SIZE }),
      );
    } else if (segment.length > 0) {
      runs.push(new TextRun({ text: segment, size: DOCX_FONTS.BODY_SIZE }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: line, size: DOCX_FONTS.BODY_SIZE })];
}

/**
 * 마크다운 콘텐츠를 DOCX 파일로 변환하여 저장한다 / Convert markdown content to DOCX and save to disk
 *
 * @param outputDir - 출력 디렉토리 경로 / Output directory path
 * @param type - 산출물 유형 / Deliverable type
 * @param markdownContent - 마크다운 콘텐츠 / Markdown content
 * @param title - 문서 제목 / Document title
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function writeDeliverableAsDocx(
  outputDir: string,
  type: BusinessDeliverableType,
  markdownContent: string,
  title: string,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  const filePath = join(outputDir, `${type}.docx`);

  try {
    await mkdir(outputDir, { recursive: true });

    const lines = markdownContent.split('\n');
    const children = parseMarkdownToParagraphs(lines);

    // WHY: 문서 제목 단락을 맨 앞에 삽입
    const titleParagraph = new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: DOCX_FONTS.TITLE_SIZE,
          color: BRAND_COLOR_HEX,
          underline: { type: UnderlineType.SINGLE },
        }),
      ],
      spacing: { before: 0, after: 400 },
      alignment: AlignmentType.CENTER,
    });

    const doc = new Document({
      creator: 'adev',
      title,
      description: `Generated by adev autonomous-dev-agent — ${type}`,
      sections: [
        {
          children: [titleParagraph, ...children],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    await Bun.write(filePath, buffer);

    logger.info('DOCX 산출물 저장 완료', { filePath, type, paragraphs: children.length });
    return ok(filePath);
  } catch (cause) {
    const error = new Layer3Error(
      'layer3_deliverable_write_failed',
      `DOCX 산출물 저장 실패: ${filePath}`,
      cause,
    );
    logger.error('DOCX 산출물 저장 실패', { filePath, type, error: error.message });
    return err(error);
  }
}
