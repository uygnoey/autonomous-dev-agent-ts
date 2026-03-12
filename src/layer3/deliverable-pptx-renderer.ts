/**
 * PPTX 렌더러 / PPTX Renderer
 *
 * @description
 * KR: pptxgenjs를 사용하여 마크다운 콘텐츠를 PPTX 프레젠테이션으로 변환한다.
 *     H1 → 슬라이드 제목, H2/H3 → 섹션 헤더, 본문 → 슬라이드 내용.
 *     슬라이드당 최대 8줄을 초과하면 자동으로 다음 슬라이드로 분할한다.
 * EN: Converts markdown content to PPTX presentation using pptxgenjs.
 *     H1 → slide title, H2/H3 → section headers, body → slide content.
 *     Automatically splits to next slide when exceeding 8 lines per slide.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { BusinessDeliverableType } from 'layer3/doc-types.js';
import pptxgen from 'pptxgenjs';

/** PPTX 레이아웃 상수 / PPTX layout constants */
const PPTX_LAYOUT = {
  TITLE_X: 0.5,
  TITLE_Y: 0.3,
  TITLE_W: 9.0,
  TITLE_H: 1.2,
  TITLE_FONT_SIZE: 32,
  BODY_X: 0.5,
  BODY_Y: 1.8,
  BODY_W: 9.0,
  BODY_H: 5.0,
  BODY_FONT_SIZE: 16,
  SECTION_FONT_SIZE: 20,
  BULLET_FONT_SIZE: 14,
  MAX_LINES_PER_SLIDE: 8,
} as const;

/** 슬라이드 콘텐츠 누적 버퍼 / Slide content accumulation buffer */
interface SlideBuffer {
  title: string;
  lines: string[];
}

/**
 * 마크다운 라인을 슬라이드 버퍼 목록으로 파싱 / Parse markdown lines into slide buffers
 *
 * @param lines - 마크다운 라인 배열 / Markdown line array
 * @returns 슬라이드 버퍼 목록 / Slide buffer list
 */
function parseMarkdownToSlides(lines: readonly string[]): SlideBuffer[] {
  const slides: SlideBuffer[] = [];
  let current: SlideBuffer = { title: '', lines: [] };

  const pushSlide = (): void => {
    if (current.title || current.lines.length > 0) {
      slides.push({ ...current, lines: [...current.lines] });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('# ')) {
      // WHY: H1은 새 슬라이드 시작 — 이전 슬라이드 저장
      pushSlide();
      current = { title: line.slice(2), lines: [] };
    } else if (line.startsWith('## ') || line.startsWith('### ')) {
      // WHY: H2/H3도 새 슬라이드 구분 기준
      pushSlide();
      const level = line.startsWith('## ') ? '▶ ' : '  ▷ ';
      current = { title: level + line.replace(/^#{2,3}\s+/, ''), lines: [] };
    } else if (line === '' || line === '---') {
      // WHY: 슬라이드가 꽉 차면 새 슬라이드로 분할
      if (current.lines.length >= PPTX_LAYOUT.MAX_LINES_PER_SLIDE) {
        pushSlide();
        current = { title: `${current.title} (cont.)`, lines: [] };
      }
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      current.lines.push(`• ${line.slice(2)}`);
    } else if (line.startsWith('```')) {
      current.lines.push('[code block]');
    } else if (line.length > 0) {
      current.lines.push(line);
    }
  }

  pushSlide();
  return slides.length > 0 ? slides : [{ title: 'Presentation', lines: [] }];
}

/**
 * 슬라이드 버퍼를 pptxgen 슬라이드로 렌더링 / Render slide buffers into pptxgen slides
 *
 * @param prs - pptxgen 인스턴스 / pptxgen instance
 * @param slideBuffers - 슬라이드 버퍼 목록 / Slide buffer list
 * @param documentTitle - 문서 전체 제목 / Overall document title
 */
function renderSlidesToPptx(
  prs: pptxgen,
  slideBuffers: readonly SlideBuffer[],
  documentTitle: string,
): void {
  // WHY: 첫 슬라이드는 표지
  const coverSlide = prs.addSlide();
  coverSlide.addText(documentTitle, {
    x: PPTX_LAYOUT.TITLE_X,
    y: 2.5,
    w: PPTX_LAYOUT.TITLE_W,
    h: 1.5,
    fontSize: 40,
    bold: true,
    align: 'center',
    color: '1F3864',
  });

  for (const buffer of slideBuffers) {
    const slide = prs.addSlide();

    if (buffer.title) {
      slide.addText(buffer.title, {
        x: PPTX_LAYOUT.TITLE_X,
        y: PPTX_LAYOUT.TITLE_Y,
        w: PPTX_LAYOUT.TITLE_W,
        h: PPTX_LAYOUT.TITLE_H,
        fontSize: PPTX_LAYOUT.TITLE_FONT_SIZE,
        bold: true,
        color: '1F3864',
      });
    }

    if (buffer.lines.length > 0) {
      const bodyText = buffer.lines.map((line) => ({
        text: line,
        options: {
          fontSize: PPTX_LAYOUT.BODY_FONT_SIZE,
          breakLine: true,
          color: '333333',
        },
      }));

      slide.addText(bodyText, {
        x: PPTX_LAYOUT.BODY_X,
        y: PPTX_LAYOUT.BODY_Y,
        w: PPTX_LAYOUT.BODY_W,
        h: PPTX_LAYOUT.BODY_H,
      });
    }
  }
}

/**
 * 마크다운 콘텐츠를 PPTX 파일로 변환하여 저장한다 / Convert markdown content to PPTX and save to disk
 *
 * @param outputDir - 출력 디렉토리 경로 / Output directory path
 * @param type - 산출물 유형 / Deliverable type
 * @param markdownContent - 마크다운 콘텐츠 / Markdown content
 * @param title - 문서 제목 / Document title
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function writeDeliverableAsPptx(
  outputDir: string,
  type: BusinessDeliverableType,
  markdownContent: string,
  title: string,
  logger: Logger,
): Promise<Result<string, Layer3Error>> {
  const filePath = join(outputDir, `${type}.pptx`);

  try {
    await mkdir(outputDir, { recursive: true });

    const prs = new pptxgen();
    prs.layout = 'LAYOUT_16x9';
    prs.title = title;

    const lines = markdownContent.split('\n');
    const slideBuffers = parseMarkdownToSlides(lines);
    renderSlidesToPptx(prs, slideBuffers, title);

    await prs.writeFile({ fileName: filePath });

    logger.info('PPTX 산출물 저장 완료', { filePath, type, slides: slideBuffers.length + 1 });
    return ok(filePath);
  } catch (cause) {
    const error = new Layer3Error(
      'layer3_deliverable_write_failed',
      `PPTX 산출물 저장 실패: ${filePath}`,
      cause,
    );
    logger.error('PPTX 산출물 저장 실패', { filePath, type, error: error.message });
    return err(error);
  }
}
