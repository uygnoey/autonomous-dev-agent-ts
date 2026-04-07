/**
 * safe-json 단위 테스트 / safe-json unit tests
 *
 * @description
 * KR: safeJsonParse, sanitizeFilePath의 보안 검증 테스트.
 *     악의적 페이로드, 깊은 중첩, 경로 순회 시도를 검증한다.
 * EN: Security tests for safeJsonParse and sanitizeFilePath.
 *     Validates malicious payloads, deep nesting, and path traversal attempts.
 */

import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_SIZE,
  safeJsonParse,
  sanitizeFilePath,
} from 'core/safe-json.js';

// ── 상수 검증 / Constants ────────────────────────────────────

describe('safe-json 상수', () => {
  it('DEFAULT_MAX_JSON_SIZE가 10MB이다', () => {
    expect(DEFAULT_MAX_JSON_SIZE).toBe(10 * 1024 * 1024);
  });

  it('DEFAULT_MAX_JSON_DEPTH가 64이다', () => {
    expect(DEFAULT_MAX_JSON_DEPTH).toBe(64);
  });
});

// ── safeJsonParse ───────────────────────────────────────────

describe('safeJsonParse', () => {
  it('유효한 JSON을 정상적으로 파싱한다', () => {
    const result = safeJsonParse<{ name: string }>('{"name":"adev"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('adev');
    }
  });

  it('배열 JSON을 정상적으로 파싱한다', () => {
    const result = safeJsonParse<number[]>('[1,2,3]');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([1, 2, 3]);
    }
  });

  it('null, boolean, number, string 리터럴도 파싱한다', () => {
    expect(safeJsonParse('null').ok).toBe(true);
    expect(safeJsonParse('true').ok).toBe(true);
    expect(safeJsonParse('42').ok).toBe(true);
    expect(safeJsonParse('"hello"').ok).toBe(true);
  });

  it('잘못된 JSON에 대해 에러를 반환한다', () => {
    const result = safeJsonParse('{invalid}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('json_parse_failed');
    }
  });

  it('빈 문자열에 대해 에러를 반환한다', () => {
    const result = safeJsonParse('');
    expect(result.ok).toBe(false);
  });

  // ── 크기 제한 / Size limits ──────────────────────────────

  it('최대 크기를 초과하는 JSON을 거부한다', () => {
    const huge = `{"x":"${'a'.repeat(200)}"}`;
    const result = safeJsonParse(huge, { maxSize: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('json_size_exceeded');
    }
  });

  it('최대 크기 이내의 JSON은 허용한다', () => {
    const small = '{"x":"abc"}';
    const result = safeJsonParse(small, { maxSize: 1024 });
    expect(result.ok).toBe(true);
  });

  it('정확히 최대 크기와 같은 JSON은 허용한다', () => {
    const exact = '{"a":1}';
    const result = safeJsonParse(exact, { maxSize: exact.length });
    expect(result.ok).toBe(true);
  });

  // ── 깊이 제한 / Depth limits ─────────────────────────────

  it('깊이 제한을 초과하는 중첩 객체를 거부한다', () => {
    // 깊이 5: {"a":{"a":{"a":{"a":{"a":1}}}}}
    let nested = '1';
    for (let i = 0; i < 5; i++) {
      nested = `{"a":${nested}}`;
    }
    const result = safeJsonParse(nested, { maxDepth: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('json_depth_exceeded');
    }
  });

  it('깊이 제한을 초과하는 중첩 배열을 거부한다', () => {
    // 깊이 5: [[[[[1]]]]]
    let nested = '1';
    for (let i = 0; i < 5; i++) {
      nested = `[${nested}]`;
    }
    const result = safeJsonParse(nested, { maxDepth: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('json_depth_exceeded');
    }
  });

  it('깊이 제한 이내의 중첩은 허용한다', () => {
    const nested = '{"a":{"b":{"c":1}}}';
    const result = safeJsonParse(nested, { maxDepth: 10 });
    expect(result.ok).toBe(true);
  });

  it('플랫 객체는 모든 깊이 제한에서 허용한다', () => {
    const flat = '{"a":1,"b":2,"c":3}';
    const result = safeJsonParse(flat, { maxDepth: 1 });
    expect(result.ok).toBe(true);
  });

  // ── 혼합 공격 / Combined attacks ────────────────────────

  it('크기와 깊이 모두 초과하면 크기 에러가 먼저 반환된다', () => {
    const bigDeep = `{"a":"${'x'.repeat(200)}"}`;
    const result = safeJsonParse(bigDeep, { maxSize: 50, maxDepth: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('json_size_exceeded');
    }
  });
});

// ── sanitizeFilePath ────────────────────────────────────────

describe('sanitizeFilePath', () => {
  it('안전한 상대 경로를 허용한다', () => {
    const result = sanitizeFilePath('src/core/config.ts');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('src/core/config.ts');
    }
  });

  it('단순 파일명을 허용한다', () => {
    const result = sanitizeFilePath('file.txt');
    expect(result.ok).toBe(true);
  });

  it('빈 경로를 거부한다', () => {
    const result = sanitizeFilePath('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_empty');
    }
  });

  it('null 바이트를 포함한 경로를 거부한다', () => {
    const result = sanitizeFilePath('file\0.txt');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_null_byte');
    }
  });

  it('../ 경로 순회를 거부한다', () => {
    const result = sanitizeFilePath('../etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_traversal');
    }
  });

  it('중간 경로의 ../ 순회를 거부한다', () => {
    const result = sanitizeFilePath('src/../../etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_traversal');
    }
  });

  it('백슬래시를 사용한 경로 순회를 거부한다', () => {
    const result = sanitizeFilePath('src\\..\\..\\etc\\passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_traversal');
    }
  });

  it('.. 만 있는 경로를 거부한다', () => {
    const result = sanitizeFilePath('..');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_traversal');
    }
  });

  it('Unix 절대 경로를 거부한다', () => {
    const result = sanitizeFilePath('/etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_absolute');
    }
  });

  it('Windows 절대 경로를 거부한다', () => {
    const result = sanitizeFilePath('C:\\Windows\\System32');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_absolute');
    }
  });

  it('소문자 Windows 드라이브 문자를 거부한다', () => {
    const result = sanitizeFilePath('c:/Users/admin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_absolute');
    }
  });
});
