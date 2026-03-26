/**
 * 파일 크기 검사 및 대용량 파일 청크 분할 / File size guard and large file chunking
 *
 * @description
 * KR: 파일 크기가 허용 범위를 초과하면 에러를 반환하거나 자동으로 청크 분할한다.
 * EN: Returns error or auto-splits into chunks when file size exceeds the allowed limit.
 */

import { AdevError } from 'core/errors.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

/** 파일 최대 허용 크기 (bytes) / Maximum allowed file size in bytes */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

/** 청크 분할 크기 (bytes) / Chunk split size in bytes */
export const SPLIT_CHUNK_SIZE_BYTES = 90 * 1024 * 1024; // 90MB per chunk

/**
 * 파일 크기를 검사한다 / Check file size
 *
 * @description
 * KR: 파일 크기가 MAX_FILE_SIZE_BYTES를 초과하면 에러를 반환한다.
 * EN: Returns error if file size exceeds MAX_FILE_SIZE_BYTES.
 *
 * @param filePath - 검사할 파일 경로 / File path to check
 * @returns ok(void) 허용 범위, err(AdevError) 초과 시 / ok if within limit, err if exceeded
 */
export async function checkFileSize(filePath: string): Promise<Result<void>> {
  try {
    const file = Bun.file(filePath);
    const size = file.size;

    if (size > MAX_FILE_SIZE_BYTES) {
      return err(
        new AdevError(
          'core_file_too_large',
          `파일 크기 초과: ${filePath} (${size} bytes > ${MAX_FILE_SIZE_BYTES} bytes)`,
        ),
      );
    }

    return ok(undefined);
  } catch (cause) {
    return err(new AdevError('core_file_too_large', `파일 크기 검사 실패: ${filePath}`, cause));
  }
}

/**
 * 대용량 파일을 청크로 분할한다 / Split large file into chunks
 *
 * @description
 * KR: 파일을 SPLIT_CHUNK_SIZE_BYTES 단위로 분할하여 outputDir에 저장한다.
 * EN: Splits file into SPLIT_CHUNK_SIZE_BYTES-sized chunks and saves to outputDir.
 *
 * @param filePath - 분할할 파일 경로 / File path to split
 * @param outputDir - 청크 파일 저장 디렉토리 / Directory to save chunk files
 * @returns ok(string[]) 청크 파일 경로 배열, err(AdevError) 실패 시 / ok with chunk paths, err on failure
 */
export async function splitLargeFile(
  filePath: string,
  outputDir: string,
): Promise<Result<string[]>> {
  try {
    const file = Bun.file(filePath);
    const buffer = new Uint8Array(await file.arrayBuffer());
    const totalSize = buffer.length;
    const fileName = basename(filePath);

    await mkdir(outputDir, { recursive: true });

    const chunkPaths: string[] = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalSize) {
      const end = Math.min(offset + SPLIT_CHUNK_SIZE_BYTES, totalSize);
      const chunk = buffer.slice(offset, end);
      const chunkPath = join(outputDir, `${fileName}.chunk_${chunkIndex}`);

      await Bun.write(chunkPath, chunk);
      chunkPaths.push(chunkPath);

      offset = end;
      chunkIndex += 1;
    }

    return ok(chunkPaths);
  } catch (cause) {
    return err(new AdevError('core_file_split_failed', `파일 분할 실패: ${filePath}`, cause));
  }
}

/**
 * 파일 크기가 초과이면 자동 분할한다 / Auto-split file if over size limit
 *
 * @description
 * KR: 파일 크기가 허용 범위 내이면 { split: false }를 반환하고,
 *     초과이면 자동으로 분할하여 { split: true, chunks } 를 반환한다.
 * EN: Returns { split: false } if within limit,
 *     auto-splits and returns { split: true, chunks } if exceeded.
 *
 * @param filePath - 검사 및 분할 대상 파일 경로 / File path to check and possibly split
 * @param outputDir - 청크 저장 디렉토리 (기본: 파일 옆 .chunks/) / Chunk output dir (default: .chunks/ beside file)
 * @returns ok({ split: false }) 정상 크기, ok({ split: true, chunks }) 분할됨, err 실패 / Result with split info
 */
export async function guardAndSplitIfNeeded(
  filePath: string,
  outputDir?: string,
): Promise<Result<{ split: false } | { split: true; chunks: string[] }>> {
  try {
    const file = Bun.file(filePath);
    const size = file.size;

    if (size <= MAX_FILE_SIZE_BYTES) {
      return ok({ split: false });
    }

    // WHY: outputDir 미지정 시 원본 파일 옆에 .chunks/ 디렉토리를 기본으로 사용
    const resolvedDir = outputDir ?? join(filePath, '..', '.chunks');
    const splitResult = await splitLargeFile(filePath, resolvedDir);

    if (!splitResult.ok) {
      return splitResult;
    }

    return ok({ split: true, chunks: splitResult.value });
  } catch (cause) {
    return err(new AdevError('core_file_split_failed', `파일 가드 실패: ${filePath}`, cause));
  }
}
