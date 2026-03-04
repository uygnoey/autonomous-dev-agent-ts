/**
 * 코드 인덱서 / Code indexer
 *
 * @description
 * KR: 파일/디렉토리를 스캔하여 청크 분할 → 임베딩 → LanceDB 저장을 수행한다.
 * EN: Scans files/directories, splits into chunks, embeds, and stores in LanceDB.
 */

import { join } from 'node:path';
import { RagError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { CodeRecord, Result } from '../core/types.js';
import type { ChunkSplitter } from './chunk-splitter.js';
import type { EmbeddingProvider, IndexDirectoryOptions } from './types.js';
import type { CodeVectorStore } from './vector-store.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 인덱싱 대상 확장자 / Default file extensions to index */
const DEFAULT_EXTENSIONS: readonly string[] = ['ts', 'js', 'tsx', 'jsx'];

/** 기본 제외 디렉토리 / Default excluded directories */
const DEFAULT_EXCLUDE_DIRS: readonly string[] = [
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.next',
  '.adev',
];

/** 기본 프로젝트 ID / Default project ID */
const DEFAULT_PROJECT_ID = 'default';

// ── CodeIndexer ─────────────────────────────────────────────────

/**
 * 코드 인덱서 / Code indexer for scanning, chunking, embedding, and storing code
 *
 * @description
 * KR: 파일을 읽어 청크로 분할하고, 임베딩하여 벡터 저장소에 저장한다.
 * EN: Reads files, splits into chunks, embeds them, and stores in the vector store.
 *
 * @param vectorStore - 코드 벡터 저장소 / Code vector store
 * @param embeddingProvider - 임베딩 프로바이더 / Embedding provider
 * @param chunkSplitter - 청크 분할기 / Chunk splitter
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const indexer = new CodeIndexer(store, provider, splitter, logger);
 * await indexer.indexFile('src/core/config.ts');
 * await indexer.indexDirectory('src/');
 */
export class CodeIndexer {
  constructor(
    private readonly vectorStore: CodeVectorStore,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly chunkSplitter: ChunkSplitter,
    private readonly logger: Logger,
  ) {}

  /**
   * 단일 파일을 인덱싱 / Index a single file
   *
   * @param filePath - 인덱싱할 파일 경로 / File path to index
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 인덱싱된 청크 수 / Number of indexed chunks
   */
  async indexFile(
    filePath: string,
    projectId = DEFAULT_PROJECT_ID,
  ): Promise<Result<number, RagError>> {
    try {
      this.logger.debug('파일 인덱싱 시작', { filePath });

      // 1. 파일 읽기 / Read file
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) {
        return err(new RagError('rag_file_not_found', `파일을 찾을 수 없습니다: ${filePath}`));
      }

      const content = await file.text();
      if (content.trim().length === 0) {
        this.logger.debug('빈 파일 스킵', { filePath });
        return ok(0);
      }

      // 2. 청크 분할 / Split into chunks
      const chunks = this.chunkSplitter.splitCode(content, filePath);
      if (chunks.length === 0) {
        this.logger.debug('청크 없음 (빈 내용)', { filePath });
        return ok(0);
      }

      // 3. 임베딩 / Embed chunks
      const texts = chunks.map((c) => c.content);
      const embedResult = await this.embeddingProvider.embed(texts);
      if (!embedResult.ok) {
        return err(
          new RagError('rag_embedding_error', `임베딩 실패: ${filePath}`, embedResult.error),
        );
      }

      // 4. 저장 / Store in vector store
      const now = new Date();
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embedResult.value[i];
        if (!(chunk && embedding)) continue;

        const record: CodeRecord = {
          id: `code-${crypto.randomUUID()}`,
          projectId,
          filePath: chunk.metadata.filePath,
          chunk: chunk.content,
          embedding,
          metadata: {
            language: chunk.metadata.language,
            module: chunk.metadata.module,
            functionName: chunk.metadata.functionName,
            lastModified: now,
            modifiedBy: 'code-indexer',
          },
        };

        const insertResult = await this.vectorStore.insert(record);
        if (!insertResult.ok) {
          this.logger.warn('청크 저장 실패, 다음 청크로 진행', {
            filePath,
            chunkIndex: i,
            error: String(insertResult.error),
          });
        }
      }

      this.logger.info('파일 인덱싱 완료', {
        filePath,
        chunkCount: chunks.length,
      });

      return ok(chunks.length);
    } catch (error: unknown) {
      this.logger.error('파일 인덱싱 실패', { filePath, error: String(error) });
      return err(new RagError('rag_indexing_error', `파일 인덱싱 실패: ${filePath}`, error));
    }
  }

  /**
   * 디렉토리를 재귀적으로 인덱싱 / Index a directory recursively
   *
   * @param dirPath - 인덱싱할 디렉토리 경로 / Directory path to index
   * @param options - 인덱싱 옵션 / Indexing options
   * @returns 인덱싱된 총 청크 수 / Total number of indexed chunks
   */
  async indexDirectory(
    dirPath: string,
    options?: IndexDirectoryOptions,
  ): Promise<Result<number, RagError>> {
    try {
      const extensions = options?.extensions ?? DEFAULT_EXTENSIONS;
      const excludeDirs = options?.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
      const projectId = options?.projectId ?? DEFAULT_PROJECT_ID;

      this.logger.info('디렉토리 인덱싱 시작', { dirPath, extensions });

      // 1. glob으로 파일 스캔 / Scan files with glob
      const filePaths = await this.scanDirectory(dirPath, extensions, excludeDirs);

      if (filePaths.length === 0) {
        this.logger.info('인덱싱할 파일 없음', { dirPath });
        return ok(0);
      }

      this.logger.info('인덱싱 대상 파일 발견', {
        dirPath,
        fileCount: filePaths.length,
      });

      // 2. 각 파일 인덱싱 / Index each file
      let totalChunks = 0;

      for (const filePath of filePaths) {
        const result = await this.indexFile(filePath, projectId);
        if (result.ok) {
          totalChunks += result.value;
        } else {
          // WHY: 개별 파일 실패 시 경고만 — 전체 인덱싱을 중단하지 않음
          this.logger.warn('파일 인덱싱 실패, 다음 파일로 진행', {
            filePath,
            error: result.error.message,
          });
        }
      }

      this.logger.info('디렉토리 인덱싱 완료', {
        dirPath,
        totalChunks,
        fileCount: filePaths.length,
      });

      return ok(totalChunks);
    } catch (error: unknown) {
      this.logger.error('디렉토리 인덱싱 실패', { dirPath, error: String(error) });
      return err(new RagError('rag_indexing_error', `디렉토리 인덱싱 실패: ${dirPath}`, error));
    }
  }

  /**
   * 디렉토리에서 대상 파일 경로를 스캔 / Scan directory for target file paths
   */
  private async scanDirectory(
    dirPath: string,
    extensions: readonly string[],
    excludeDirs: readonly string[],
  ): Promise<string[]> {
    const patterns = extensions.map((ext) => join(dirPath, `**/*.${ext}`));

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const glob = new Bun.Glob(pattern);
      for await (const filePath of glob.scan({ dot: false })) {
        // WHY: 제외 디렉토리 체크 — node_modules, dist 등은 인덱싱 불필요
        const shouldExclude = excludeDirs.some(
          (dir) => filePath.includes(`/${dir}/`) || filePath.includes(`${dir}/`),
        );
        if (!shouldExclude) {
          allFiles.push(filePath);
        }
      }
    }

    return allFiles;
  }
}
