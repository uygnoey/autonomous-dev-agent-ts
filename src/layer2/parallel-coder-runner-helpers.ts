/**
 * 병렬 Coder 실행기 헬퍼 / Parallel Coder Runner Helpers
 *
 * @description
 * KR: ParallelCoderRunner에서 사용하는 순수 헬퍼 함수들을 정의한다.
 * EN: Defines pure helper functions used by ParallelCoderRunner.
 */

import type { Logger } from 'core/logger.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';

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

/**
 * architect 에이전트를 통해 의존성 순서 기반 모듈 목록을 추출한다
 * / Extracts modules with dependency ordering via architect agent
 *
 * @description
 * KR: architect 에이전트에게 스펙 분석을 요청하여 모듈 간 의존성 그래프를 생성한다.
 *     에이전트 응답에서 JSON 형식의 모듈 순서를 파싱하여 반환한다.
 *     에이전트 호출 실패 시 extractModulesFromSpec()으로 폴백.
 * EN: Requests spec analysis from architect agent to build dependency graph.
 *     Parses JSON module ordering from agent response.
 *     Falls back to extractModulesFromSpec() on agent call failure.
 *
 * @param spec - 스펙 문서 / Spec document
 * @param agentGenerator - 에이전트 설정 생성기 / Agent config generator
 * @param agentSpawner - 에이전트 스포너 / Agent spawner
 * @param featureId - 기능 ID / Feature ID
 * @param logger - 로거 / Logger
 * @returns 의존성 순서 기반 모듈 목록 / Dependency-ordered module list
 */
export async function extractModulesWithDependencyOrder(
  spec: string,
  agentGenerator: AgentGenerator,
  agentSpawner: AgentSpawner,
  featureId: string,
  logger: Logger,
): Promise<string[]> {
  try {
    const configResult = agentGenerator.generateAgentConfig('architect', spec, featureId);

    if (!configResult.ok) {
      logger.warn('architect 에이전트 설정 생성 실패 — 정적 파싱 폴백', {
        featureId,
        error: configResult.error.message,
      });
      return extractModulesFromSpec(spec);
    }

    // WHY: architect에게 의존성 순서만 JSON 배열로 요청 — 파싱 실패 방지를 위해 응답 형식 강제
    const config = {
      ...configResult.value,
      prompt: `다음 스펙을 분석하여 구현 순서를 의존성 기반으로 결정하라. 응답은 반드시 JSON 배열로만: ["module1", "module2", ...]\n\n${spec}`,
    };

    let parsedModules: string[] | undefined;

    for await (const event of agentSpawner.spawn(config)) {
      if (event.type !== 'message') continue;

      // WHY: 에이전트 응답에서 JSON 배열 패턴을 탐지하여 파싱 시도
      const jsonMatch = event.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      try {
        const parsed: unknown = JSON.parse(jsonMatch[0]);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((item) => typeof item === 'string')
        ) {
          parsedModules = parsed as string[];
        }
      } catch {
        // WHY: JSON 파싱 실패는 무시하고 다음 message 이벤트를 계속 탐색
      }
    }

    if (parsedModules && parsedModules.length > 0) {
      logger.info('architect 에이전트 기반 의존성 순서 추출 성공', {
        featureId,
        moduleCount: parsedModules.length,
      });
      return parsedModules;
    }

    logger.warn('architect 에이전트 응답에서 모듈 목록 파싱 실패 — 정적 파싱 폴백', {
      featureId,
    });
    return extractModulesFromSpec(spec);
  } catch (caught: unknown) {
    logger.warn('architect 에이전트 호출 실패 — 정적 파싱 폴백', {
      featureId,
      error: caught instanceof Error ? caught.message : String(caught),
    });
    return extractModulesFromSpec(spec);
  }
}
