/**
 * V2 Session 환경변수 빌더 / V2 Session environment variable builder
 *
 * @description
 * KR: V2SessionExecutor에서 에이전트 실행 시 필요한 환경변수를 구성한다.
 *     process.env 병합, API Key 오버라이드, CLAUDECODE 제거, Agent Teams 제어를 담당한다.
 * EN: Builds environment variables required for agent execution in V2SessionExecutor.
 *     Handles process.env merging, API Key override, CLAUDECODE removal, and Agent Teams control.
 */

import type { AuthProvider } from 'auth/types.js';
import type { AgentConfig } from 'layer2/types.js';

/**
 * 세션 실행에 필요한 환경변수를 구성한다 / Build environment variables for session execution
 *
 * @description
 * KR: - process.env를 기반으로 필요한 것만 오버라이드한다.
 *     - API Key는 adev 인증을 우선 적용한다.
 *     - CLAUDECODE 환경변수를 제거하여 nested session 에러를 방지한다.
 *     - DESIGN Phase에서만 Agent Teams를 활성화한다.
 * EN: - Uses process.env as base and overrides only what is needed.
 *     - Prioritizes adev auth for API Key.
 *     - Removes CLAUDECODE env var to prevent nested session errors.
 *     - Enables Agent Teams only for DESIGN Phase.
 *
 * @param config - 에이전트 설정 / Agent configuration
 * @param authProvider - 인증 제공자 / Auth provider
 * @returns 환경변수 객체 / Environment variable object
 */
export function buildSessionEnvironment(
  config: AgentConfig,
  authProvider: AuthProvider,
): Record<string, string> {
  const authHeader = authProvider.getAuthHeader();

  // WHY: SDK의 env 파라미터는 process.env를 완전 대체함 (merge 아님).
  //      process.env 없이 {ANTHROPIC_API_KEY: '...'} 만 전달하면 PATH, HOME 등
  //      필수 시스템 환경변수가 사라져 Claude Code CLI가 실패함.
  //      process.env를 base로 하고 필요한 것만 오버라이드.
  const baseEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };

  // WHY: API Key는 항상 오버라이드 (adev 인증 우선)
  if ('x-api-key' in authHeader) {
    baseEnv.ANTHROPIC_API_KEY = authHeader['x-api-key'] as string;
  }

  // WHY: OAuth Token도 있으면 함께 전달 (agent-sdk가 OAuth 인증에 활용)
  if ('authorization' in authHeader) {
    const token = (authHeader.authorization as string).replace('Bearer ', '');
    baseEnv.CLAUDE_CODE_OAUTH_TOKEN = token;
  }

  // WHY: CLAUDECODE 환경변수가 설정된 상태에서 Claude Code CLI를 서브프로세스로 실행하면
  //      "nested Claude Code session" 에러로 exit code 1 종료됨.
  //      서브프로세스가 독립 세션으로 시작하도록 반드시 제거.
  // biome-ignore lint/performance/noDelete: 환경변수 키 자체를 제거해야 undefined 전달과 다르게 동작함 (nested session 방지)
  delete baseEnv.CLAUDECODE;

  // WHY: DESIGN Phase만 Agent Teams 활성화 (팀 간 SendMessage 가능).
  //      다른 Phase(CODE/TEST/VERIFY)는 독립 실행이므로 AGENT_TEAMS 키 자체를 제거.
  //      process.env에 이미 설정되어 있을 수 있으므로 명시적 제어 필수.
  if (config.phase === 'DESIGN') {
    baseEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
  } else {
    // biome-ignore lint/performance/noDelete: Phase별 AGENT_TEAMS 제어 — 키 완전 제거 필요 (undefined 할당 시 "undefined" 문자열로 전달됨)
    delete baseEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  }

  return { ...baseEnv, ...(config.env ?? {}) };
}
