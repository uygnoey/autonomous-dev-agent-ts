/**
 * 병렬 Coder 실행기 헬퍼 / Parallel Coder Runner Helpers
 *
 * @description
 * KR: ParallelCoderRunner에서 사용하는 순수 헬퍼 함수들을 정의한다.
 * EN: Defines pure helper functions used by ParallelCoderRunner.
 */

// ── 헬퍼 함수 / Helper functions ────────────────────────────────

/**
 * 스펙에서 모듈 목록을 추출한다 / Extracts module list from spec
 *
 * @description
 * KR: 마크다운 스펙에서 "## Module: xxx" 또는 "## Component: xxx" 패턴을 파싱하여
 *     모듈명을 추출한다. 중복 제거, 빈 입력 방어. 결과 없으면 ['default'] 반환.
 * EN: Parses "## Module: xxx" or "## Component: xxx" patterns from markdown spec
 *     to extract module names. Deduplicates, guards empty input. Returns ['default'] if none found.
 *
 * @param spec - 스펙 문서 / Spec document
 * @returns 모듈 목록 / Module list
 */
export function extractModulesFromSpec(spec: string): string[] {
  if (!spec || spec.trim() === '') return ['default'];

  const modules: string[] = [];
  const lines = spec.split('\n');

  for (const line of lines) {
    // WHY: "## Module: xxx" 또는 "## Component: xxx" 패턴으로 모듈/컴포넌트 섹션 탐지
    const moduleMatch = line.match(/^#{1,3}\s+(?:Module|Component|모듈|컴포넌트)\s*:\s*(.+)/i);
    if (moduleMatch) {
      const moduleName = moduleMatch[1]?.trim();
      if (moduleName && !modules.includes(moduleName)) {
        modules.push(moduleName);
      }
    }
  }

  // WHY: 모듈을 찾지 못하면 단일 'default' 모듈로 폴백
  return modules.length > 0 ? modules : ['default'];
}
