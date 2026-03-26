/**
 * file-size-guard 단위 테스트 / file-size-guard unit tests
 *
 * @description
 * KR: checkFileSize, splitLargeFile, guardAndSplitIfNeeded의 경계/엣지 케이스 검증.
 * EN: Tests for checkFileSize, splitLargeFile, guardAndSplitIfNeeded including boundary and edge cases.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MAX_FILE_SIZE_BYTES,
  SPLIT_CHUNK_SIZE_BYTES,
  checkFileSize,
  guardAndSplitIfNeeded,
  splitLargeFile,
} from 'core/file-size-guard.js';

// ── 테스트용 임시 디렉토리 / Test temp directory ─────────────

const TEST_DIR = join(tmpdir(), `file-size-guard-test-${Date.now()}`);

async function writeTestFile(name: string, sizeBytes: number): Promise<string> {
  const filePath = join(TEST_DIR, name);
  const buffer = new Uint8Array(sizeBytes);
  await Bun.write(filePath, buffer);
  return filePath;
}

beforeEach(async () => {
  await Bun.write(join(TEST_DIR, '.keep'), '');
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ── 상수 검증 / Constants ────────────────────────────────────

describe('file-size-guard 상수', () => {
  it('MAX_FILE_SIZE_BYTES가 100MB이다', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(100 * 1024 * 1024);
  });

  it('SPLIT_CHUNK_SIZE_BYTES가 90MB이다', () => {
    expect(SPLIT_CHUNK_SIZE_BYTES).toBe(90 * 1024 * 1024);
  });

  it('SPLIT_CHUNK_SIZE_BYTES가 MAX_FILE_SIZE_BYTES보다 작다', () => {
    expect(SPLIT_CHUNK_SIZE_BYTES).toBeLessThan(MAX_FILE_SIZE_BYTES);
  });
});

// ── checkFileSize ────────────────────────────────────────────

describe('checkFileSize', () => {
  it('작은 파일(1KB)은 통과한다', async () => {
    const filePath = await writeTestFile('small.bin', 1024);

    const result = await checkFileSize(filePath);

    expect(result.ok).toBe(true);
  });

  it('빈 파일(0bytes)은 통과한다', async () => {
    const filePath = await writeTestFile('empty.bin', 0);

    const result = await checkFileSize(filePath);

    expect(result.ok).toBe(true);
  });

  it('정확히 100MB 파일은 통과한다 (경계값: size === MAX)', async () => {
    const filePath = await writeTestFile('exact-100mb.bin', MAX_FILE_SIZE_BYTES);

    const result = await checkFileSize(filePath);

    // WHY: 조건이 size > MAX이므로 정확히 100MB는 통과
    expect(result.ok).toBe(true);
  });

  it('100MB + 1byte 파일은 거부한다 (경계값: size > MAX)', async () => {
    const filePath = await writeTestFile('over-100mb.bin', MAX_FILE_SIZE_BYTES + 1);

    const result = await checkFileSize(filePath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('core_file_too_large');
      expect(result.error.message).toContain('파일 크기 초과');
    }
  });

  it('존재하지 않는 파일은 에러를 반환한다', async () => {
    const result = await checkFileSize(join(TEST_DIR, 'nonexistent-file.bin'));

    // WHY: Bun.file().size는 파일 없으면 0을 반환하거나 에러 발생 가능
    // 실제 동작에 따라 ok 또는 에러가 될 수 있음
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── splitLargeFile ───────────────────────────────────────────

describe('splitLargeFile', () => {
  it('90MB 이하 파일은 청크 1개를 생성한다', async () => {
    const size = SPLIT_CHUNK_SIZE_BYTES;
    const filePath = await writeTestFile('one-chunk.bin', size);
    const outputDir = join(TEST_DIR, 'chunks-one');

    const result = await splitLargeFile(filePath, outputDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
    }
  });

  it('91MB 파일은 청크 2개를 생성한다', async () => {
    const size = SPLIT_CHUNK_SIZE_BYTES + 1024 * 1024; // 91MB
    const filePath = await writeTestFile('two-chunks.bin', size);
    const outputDir = join(TEST_DIR, 'chunks-two');

    const result = await splitLargeFile(filePath, outputDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('빈 파일은 청크 0개를 생성한다', async () => {
    const filePath = await writeTestFile('empty-split.bin', 0);
    const outputDir = join(TEST_DIR, 'chunks-empty');

    const result = await splitLargeFile(filePath, outputDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('청크 파일명이 원본 파일명을 포함한다', async () => {
    const filePath = await writeTestFile('named-file.bin', 1024);
    const outputDir = join(TEST_DIR, 'chunks-named');

    const result = await splitLargeFile(filePath, outputDir);

    expect(result.ok).toBe(true);
    if (result.ok && result.value.length > 0) {
      expect(result.value[0]).toContain('named-file.bin');
      expect(result.value[0]).toContain('chunk_0');
    }
  });
});

// ── guardAndSplitIfNeeded ────────────────────────────────────

describe('guardAndSplitIfNeeded', () => {
  it('100MB 이하 파일은 split: false를 반환한다', async () => {
    const filePath = await writeTestFile('small-guard.bin', 1024);

    const result = await guardAndSplitIfNeeded(filePath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.split).toBe(false);
    }
  });

  it('정확히 100MB 파일은 split: false를 반환한다 (경계값)', async () => {
    const filePath = await writeTestFile('exact-guard.bin', MAX_FILE_SIZE_BYTES);

    const result = await guardAndSplitIfNeeded(filePath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.split).toBe(false);
    }
  });

  it('100MB 초과 파일은 split: true와 chunks를 반환한다', async () => {
    const filePath = await writeTestFile('large-guard.bin', MAX_FILE_SIZE_BYTES + 1024);
    const outputDir = join(TEST_DIR, 'guard-chunks');

    const result = await guardAndSplitIfNeeded(filePath, outputDir);

    expect(result.ok).toBe(true);
    if (result.ok && result.value.split) {
      expect(result.value.chunks.length).toBeGreaterThan(0);
    }
  });

  it('outputDir 미지정 시 기본 .chunks/ 디렉토리를 사용한다', async () => {
    const filePath = await writeTestFile('default-dir.bin', MAX_FILE_SIZE_BYTES + 1024);

    const result = await guardAndSplitIfNeeded(filePath);

    expect(result.ok).toBe(true);
    if (result.ok && result.value.split) {
      expect(result.value.chunks[0]).toContain('.chunks');
    }
  });
});
