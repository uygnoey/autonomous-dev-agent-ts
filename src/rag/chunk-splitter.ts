/**
 * 코드 청크 분할기 / Code chunk splitter
 *
 * @description
 * KR: 소스 코드를 함수/클래스 단위로 분할하여 인덱싱 가능한 청크를 생성한다.
 *     간단한 정규식 패턴 기반 분할 (AST 불필요).
 * EN: Splits source code into function/class-level chunks for indexing.
 *     Uses simple regex pattern-based splitting (no AST required).
 */

import {
  type BoundaryInfo,
  detectBoundaries,
  detectLanguage,
  extractModule,
} from 'rag/chunk-splitter-utils.js';
import type { ChunkInput, ChunkMetadata, ChunkOptions } from 'rag/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 최대 청크 크기 (문자 수) / Default max chunk size in characters */
const DEFAULT_MAX_CHUNK_SIZE = 2000;

/** 기본 오버랩 비율 / Default overlap ratio */
const DEFAULT_OVERLAP_RATIO = 0.1;

// ── ChunkSplitter ───────────────────────────────────────────────

/**
 * 코드 청크 분할기 / Code chunk splitter
 *
 * @description
 * KR: 소스 코드 파일을 함수/클래스 단위 청크로 분할한다.
 *     청크 크기 제한과 오버랩을 지원한다.
 * EN: Splits source code files into function/class level chunks.
 *     Supports chunk size limits and overlap.
 *
 * @example
 * const splitter = new ChunkSplitter();
 * const chunks = splitter.splitCode(content, 'src/core/config.ts');
 */
export class ChunkSplitter {
  /**
   * 소스 코드를 청크로 분할 / Split source code into chunks
   *
   * @param content - 소스 코드 내용 / Source code content
   * @param filePath - 파일 경로 / File path
   * @param options - 분할 옵션 / Chunk options
   * @returns ChunkInput 배열 / Array of ChunkInput
   */
  splitCode(content: string, filePath: string, options?: ChunkOptions): ChunkInput[] {
    if (content.trim().length === 0) return [];

    const maxChunkSize = options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
    const overlapRatio = options?.overlapRatio ?? DEFAULT_OVERLAP_RATIO;
    const language = detectLanguage(filePath);
    const modulePath = extractModule(filePath);

    const lines = content.split('\n');
    const boundaries = detectBoundaries(lines, language);

    // WHY: 경계가 없으면 고정 크기 분할로 폴백 — 일부 파일은 함수/클래스 없이 구성됨
    if (boundaries.length === 0) {
      return this.splitBySize(lines, filePath, language, modulePath, maxChunkSize, overlapRatio);
    }

    return this.splitByBoundaries(
      lines,
      boundaries,
      filePath,
      language,
      modulePath,
      maxChunkSize,
      overlapRatio,
    );
  }

  /**
   * 함수/클래스 경계 기반 분할 / Split by function/class boundaries
   */
  private splitByBoundaries(
    lines: string[],
    boundaries: BoundaryInfo[],
    filePath: string,
    language: string,
    modulePath: string,
    maxChunkSize: number,
    overlapRatio: number,
  ): ChunkInput[] {
    const chunks: ChunkInput[] = [];
    const overlapLines = Math.max(1, Math.floor((lines.length * overlapRatio) / boundaries.length));

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      if (!boundary) continue;

      const startLine = boundary.line;
      const nextBoundary = boundaries[i + 1];
      const endLine = nextBoundary ? nextBoundary.line - 1 : lines.length - 1;

      const chunkLines = lines.slice(startLine, endLine + 1);
      let chunkContent = chunkLines.join('\n');

      // WHY: 청크가 maxChunkSize를 초과하면 절단 — 메모리 효율성
      if (chunkContent.length > maxChunkSize) {
        chunkContent = chunkContent.slice(0, maxChunkSize);
      }

      if (chunkContent.trim().length === 0) continue;

      const metadata: ChunkMetadata = {
        filePath,
        startLine: startLine + 1,
        endLine: endLine + 1,
        language,
        module: modulePath,
        functionName: boundary.name,
      };

      chunks.push({ content: chunkContent, metadata });

      // WHY: 오버랩 청크 추가 — 경계 부근 코드 검색 정확도 향상
      if (i < boundaries.length - 1 && overlapLines > 0) {
        const overlapStart = Math.max(startLine, endLine - overlapLines + 1);
        const overlapEnd = Math.min(
          endLine + overlapLines,
          nextBoundary ? nextBoundary.line - 1 : lines.length - 1,
        );

        if (overlapEnd > endLine) {
          const overlapContent = lines.slice(overlapStart, overlapEnd + 1).join('\n');
          if (overlapContent.trim().length > 0 && overlapContent.length <= maxChunkSize) {
            chunks.push({
              content: overlapContent,
              metadata: {
                filePath,
                startLine: overlapStart + 1,
                endLine: overlapEnd + 1,
                language,
                module: modulePath,
                functionName: `${boundary.name}_overlap`,
              },
            });
          }
        }
      }
    }

    return chunks;
  }

  /**
   * 고정 크기 기반 분할 (경계 미감지 시 폴백) / Split by fixed size (fallback)
   */
  private splitBySize(
    lines: string[],
    filePath: string,
    language: string,
    modulePath: string,
    maxChunkSize: number,
    overlapRatio: number,
  ): ChunkInput[] {
    const chunks: ChunkInput[] = [];
    const overlapChars = Math.floor(maxChunkSize * overlapRatio);
    const fullContent = lines.join('\n');

    let offset = 0;
    let chunkIndex = 0;

    while (offset < fullContent.length) {
      const end = Math.min(offset + maxChunkSize, fullContent.length);
      const chunkContent = fullContent.slice(offset, end);

      if (chunkContent.trim().length === 0) break;

      const startLine = fullContent.slice(0, offset).split('\n').length;
      const endLine = fullContent.slice(0, end).split('\n').length;

      chunks.push({
        content: chunkContent,
        metadata: {
          filePath,
          startLine,
          endLine,
          language,
          module: modulePath,
          functionName: `chunk_${chunkIndex}`,
        },
      });

      offset = end - overlapChars;
      if (offset >= fullContent.length) break;
      // WHY: 무한 루프 방지 — overlapChars가 maxChunkSize보다 크면 전진 불가
      if (end === fullContent.length) break;
      chunkIndex++;
    }

    return chunks;
  }
}

// Re-export utilities for external consumers
export { detectLanguage, extractModule } from 'rag/chunk-splitter-utils.js';
