/**
 * 통합 테스터 헬퍼 / Integration Tester Helpers
 *
 * @description
 * KR: IntegrationTester에서 사용하는 순수 헬퍼 함수들을 정의한다.
 * EN: Defines pure helper functions used by IntegrationTester.
 */

// ── 헬퍼 함수 / Helper functions ────────────────────────────────

/**
 * Bun 테스트 출력을 파싱한다 / Parses Bun test output
 *
 * @description
 * KR: stdout/stderr에서 테스트 결과를 추출한다.
 *     Bun 테스트 출력 형식: "X tests | Y passed | Z failed"
 * EN: Extracts test results from stdout/stderr.
 *     Bun test output format: "X tests | Y passed | Z failed"
 *
 * @param stdout - 표준 출력 / Standard output
 * @param stderr - 표준 에러 / Standard error
 * @returns 파싱된 결과 / Parsed result
 */
export function parseBunTestOutput(
  stdout: string,
  stderr: string,
): { totalTests: number; failCount: number } {
  const output = stdout + stderr;

  // WHY: Bun 테스트 출력 패턴 매칭
  const testCountMatch = /(\d+)\s+tests?/i.exec(output);
  const failCountMatch = /(\d+)\s+failed/i.exec(output);

  const totalTests = testCountMatch?.[1] ? Number.parseInt(testCountMatch[1], 10) : 0;
  const failCount = failCountMatch?.[1] ? Number.parseInt(failCountMatch[1], 10) : 0;

  return { totalTests, failCount };
}
