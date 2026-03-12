/**
 * 마크다운 → HTML 변환기 / Markdown to HTML Converter
 *
 * @description
 * KR: 마크다운 콘텐츠를 HTML 문서로 변환하는 순수 함수 모음.
 *     외부 의존성 없이 기본 마크다운 문법을 지원한다.
 *     지원: h1-h6, p, ul/li, ol/li, code block, inline code, bold, italic, hr, blockquote.
 * EN: Pure functions to convert markdown content into HTML documents.
 *     Supports basic markdown syntax without external dependencies.
 *     Supports: h1-h6, p, ul/li, ol/li, code block, inline code, bold, italic, hr, blockquote.
 */

/**
 * HTML 문서 옵션 / HTML document options
 */
export interface HtmlDocumentOptions {
  /** 문서 제목 / Document title */
  readonly title: string;
  /** CSS 스타일 포함 여부 / Whether to include CSS styles */
  readonly includeStyles?: boolean;
  /** 언어 코드 / Language code */
  readonly lang?: string;
}

/** 기본 CSS 스타일 / Default CSS styles */
const DEFAULT_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
    color: #333;
  }
  h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; color: #1a1a1a; }
  h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
  code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f4f4f4; padding: 1em; border-radius: 5px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #666; }
  hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
  ul, ol { padding-left: 2em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: 0.5em; text-align: left; }
  th { background: #f4f4f4; }
`;

/**
 * 마크다운 인라인 요소를 HTML로 변환 / Convert markdown inline elements to HTML
 *
 * @param line - 마크다운 텍스트 행 / Markdown text line
 * @returns HTML 변환된 행 / HTML converted line
 */
function convertInlineElements(line: string): string {
  // WHY: 순서가 중요 - bold(**) 먼저, italic(*) 나중에 처리
  let result = line;
  // bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

/**
 * 마크다운을 HTML 본문으로 변환 / Convert markdown to HTML body content
 *
 * @param markdown - 마크다운 문자열 / Markdown string
 * @returns HTML 본문 문자열 / HTML body string
 */
export function convertMarkdownToHtmlBody(markdown: string): string {
  const lines = markdown.split('\n');
  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let inList: 'ul' | 'ol' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // WHY: 코드 블록은 다른 변환보다 우선 처리
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        htmlParts.push('</code></pre>');
        inCodeBlock = false;
      } else {
        const lang = line.slice(3).trim();
        const langAttr = lang ? ` class="language-${lang}"` : '';
        htmlParts.push(`<pre><code${langAttr}>`);
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      // WHY: 코드 블록 내부는 HTML 이스케이프만 적용
      htmlParts.push(escapeHtml(line));
      continue;
    }

    // WHY: 리스트 항목이 아닌 행이 나오면 현재 리스트를 닫음
    const isUnorderedItem = /^[-*+]\s/.test(line);
    const isOrderedItem = /^\d+\.\s/.test(line);
    if (inList && !isUnorderedItem && !isOrderedItem && line.trim() !== '') {
      htmlParts.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }

    // 빈 행 / Empty line
    if (line.trim() === '') {
      if (inList) {
        htmlParts.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      continue;
    }

    // 제목 / Headings (h1-h6)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = (headingMatch[1] ?? '').length;
      const text = convertInlineElements(headingMatch[2] ?? '');
      htmlParts.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    // 수평선 / Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      htmlParts.push('<hr>');
      continue;
    }

    // 인용문 / Blockquote
    if (line.startsWith('>')) {
      const text = convertInlineElements(line.replace(/^>\s?/, ''));
      htmlParts.push(`<blockquote><p>${text}</p></blockquote>`);
      continue;
    }

    // 비순서 리스트 / Unordered list
    if (isUnorderedItem) {
      if (inList !== 'ul') {
        if (inList) htmlParts.push('</ol>');
        htmlParts.push('<ul>');
        inList = 'ul';
      }
      const text = convertInlineElements(line.replace(/^[-*+]\s/, ''));
      htmlParts.push(`<li>${text}</li>`);
      continue;
    }

    // 순서 리스트 / Ordered list
    if (isOrderedItem) {
      if (inList !== 'ol') {
        if (inList) htmlParts.push('</ul>');
        htmlParts.push('<ol>');
        inList = 'ol';
      }
      const text = convertInlineElements(line.replace(/^\d+\.\s/, ''));
      htmlParts.push(`<li>${text}</li>`);
      continue;
    }

    // 일반 문단 / Paragraph
    htmlParts.push(`<p>${convertInlineElements(line)}</p>`);
  }

  // WHY: 닫히지 않은 리스트/코드 블록 정리
  if (inList) {
    htmlParts.push(inList === 'ul' ? '</ul>' : '</ol>');
  }
  if (inCodeBlock) {
    htmlParts.push('</code></pre>');
  }

  return htmlParts.join('\n');
}

/**
 * HTML 특수 문자 이스케이프 / Escape HTML special characters
 *
 * @param text - 원본 텍스트 / Raw text
 * @returns 이스케이프된 텍스트 / Escaped text
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 마크다운을 완전한 HTML 문서로 변환 / Convert markdown to a complete HTML document
 *
 * @param markdown - 마크다운 문자열 / Markdown string
 * @param options - HTML 문서 옵션 / HTML document options
 * @returns 완전한 HTML 문서 문자열 / Complete HTML document string
 *
 * @example
 * const html = markdownToHtml('# Hello', { title: 'My Doc' });
 */
export function markdownToHtml(markdown: string, options: HtmlDocumentOptions): string {
  const { title, includeStyles = true, lang = 'en' } = options;
  const body = convertMarkdownToHtmlBody(markdown);
  const styleBlock = includeStyles ? `<style>${DEFAULT_STYLES}</style>` : '';

  return [
    '<!DOCTYPE html>',
    `<html lang="${lang}">`,
    '<head>',
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `<title>${escapeHtml(title)}</title>`,
    styleBlock,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('\n');
}
