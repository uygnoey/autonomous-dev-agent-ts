/**
 * 코드 청크 분할기 유틸리티 / Code chunk splitter utilities
 *
 * @description
 * KR: 언어 감지, 모듈 경로 추출, 코드 경계 감지에 사용되는 상수 및 함수.
 * EN: Constants and functions for language detection, module path extraction,
 *     and code boundary detection used by ChunkSplitter.
 */

import { basename, dirname } from 'node:path';

// ── 상수 / Constants ────────────────────────────────────────────

/** 파일 확장자 → 언어 매핑 / File extension to language mapping */
export const EXTENSION_LANGUAGE_MAP: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  cpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  swift: 'swift',
  kt: 'kotlin',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
};

/**
 * 함수/클래스 경계를 감지하는 정규식 패턴 (언어별)
 * Regex patterns for detecting function/class boundaries per language
 */
export const BOUNDARY_PATTERNS: Readonly<Record<string, RegExp>> = {
  typescript:
    /^(?:export\s+)?(?:(?:async\s+)?function\s+\w+|class\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(|interface\s+\w+|type\s+\w+\s*=)/,
  javascript:
    /^(?:export\s+)?(?:(?:async\s+)?function\s+\w+|class\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\()/,
  python: /^(?:def\s+\w+|class\s+\w+|async\s+def\s+\w+)/,
  rust: /^(?:pub\s+)?(?:fn\s+\w+|struct\s+\w+|enum\s+\w+|impl\s+|trait\s+\w+)/,
  go: /^(?:func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+|type\s+\w+\s+struct)/,
};

// ── 내부 타입 / Internal Types ──────────────────────────────────

/** 코드 경계 정보 / Code boundary info */
export interface BoundaryInfo {
  readonly line: number;
  readonly name: string;
}

// ── 유틸리티 함수 / Utility Functions ───────────────────────────

/**
 * 파일 확장자로 프로그래밍 언어를 감지 / Detect programming language by file extension
 *
 * @param filePath - 파일 경로 / File path
 * @returns 감지된 언어 또는 'unknown' / Detected language or 'unknown'
 */
export function detectLanguage(filePath: string): string {
  const fileName = basename(filePath);
  const ext = fileName.includes('.') ? fileName.split('.').pop() : undefined;
  if (!ext) return 'unknown';
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'unknown';
}

/**
 * 파일 경로에서 모듈 경로를 추출 / Extract module path from file path
 *
 * @param filePath - 파일 경로 / File path
 * @returns 모듈 경로 (예: 'src/core') / Module path
 */
export function extractModule(filePath: string): string {
  const dir = dirname(filePath);
  // WHY: src/ 이하의 첫 두 세그먼트를 모듈로 간주 (예: src/core, src/rag)
  const srcIndex = dir.indexOf('src/');
  if (srcIndex === -1) return dir;

  const afterSrc = dir.slice(srcIndex);
  const parts = afterSrc.split('/');
  // 'src' + 모듈명 (최대 2 세그먼트)
  return parts.slice(0, 2).join('/');
}

/**
 * 코드 라인에서 함수/클래스 경계를 감지 / Detect function/class boundaries in code lines
 *
 * @param lines - 코드 라인 배열 / Code line array
 * @param language - 프로그래밍 언어 / Programming language
 * @returns 경계 정보 배열 / Array of boundary info
 */
export function detectBoundaries(lines: string[], language: string): BoundaryInfo[] {
  const pattern = BOUNDARY_PATTERNS[language];
  if (!pattern) {
    // WHY: 언어별 패턴이 없으면 빈 배열 반환 → splitBySize 폴백
    return [];
  }

  const boundaries: BoundaryInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const trimmed = line.trimStart();
    if (pattern.test(trimmed)) {
      const name = extractFunctionName(trimmed);
      boundaries.push({ line: i, name });
    }
  }

  return boundaries;
}

/**
 * 코드 라인에서 함수/클래스 이름을 추출 / Extract function/class name from a code line
 *
 * @param line - 코드 라인 / Code line
 * @returns 함수/클래스 이름 / Function or class name
 */
export function extractFunctionName(line: string): string {
  // 'function foo(' → 'foo'
  const funcMatch = line.match(/function\s+(\w+)/);
  if (funcMatch?.[1]) return funcMatch[1];

  // 'class Foo' → 'Foo'
  const classMatch = line.match(/class\s+(\w+)/);
  if (classMatch?.[1]) return classMatch[1];

  // 'const foo = ' → 'foo'
  const constMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
  if (constMatch?.[1]) return constMatch[1];

  // 'interface Foo' → 'Foo'
  const ifaceMatch = line.match(/interface\s+(\w+)/);
  if (ifaceMatch?.[1]) return ifaceMatch[1];

  // 'type Foo =' → 'Foo'
  const typeMatch = line.match(/type\s+(\w+)\s*=/);
  if (typeMatch?.[1]) return typeMatch[1];

  // 'def foo(' → 'foo'
  const defMatch = line.match(/def\s+(\w+)/);
  if (defMatch?.[1]) return defMatch[1];

  // 'fn foo(' → 'foo'
  const fnMatch = line.match(/fn\s+(\w+)/);
  if (fnMatch?.[1]) return fnMatch[1];

  return 'unknown';
}
