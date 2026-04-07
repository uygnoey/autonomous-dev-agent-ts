/**
 * CLI 도움말 텍스트 / CLI help text
 *
 * @description
 * KR: 전역 도움말 텍스트를 정의한다.
 * EN: Defines global help text.
 */

/**
 * 전역 도움말 텍스트를 반환한다 / Returns global help text
 *
 * @returns 도움말 문자열 / Help text string
 */
export function getHelpText(): string {
  return `
adev - Claude Code Agent Development CLI

사용법 / Usage:
  adev <command> [옵션 / options]

명령어 / Commands:
  init              프로젝트 초기화 / Initialize project
  start             Layer1 대화 시작 / Start Layer1 conversation
  auth              인증 설정 / Setup or renew authentication
  config <sub>      설정 관리 / Manage configuration (get/set/list/reset)
  setting <sub>     설정 관리 / Manage configuration (alias: config)
  project <sub>     프로젝트 관리 / Manage projects (add/remove/list/switch/update)
  plugin <sub>      플러그인 관리 / Manage plugins (list/install/remove/create)
  dashboard         실시간 모니터링 대시보드 / Real-time monitoring dashboard

전역 옵션 / Global Options:
  -v, --verbose     상세 로그 출력 / Enable verbose logging
  -h, --help        도움말 표시 / Show help
  -V, --version     버전 표시 / Show version
  --no-color        색상 비활성화 / Disable colors

자세한 명령어 도움말 / Detailed command help:
  adev <command> --help

예제 / Examples:
  adev init
  adev start
  adev auth               # 인증 설정
  adev auth --status      # 인증 상태 확인
  adev config get logLevel
  adev setting set logLevel debug
  adev project list

문서 / Documentation:
  https://github.com/uygnoey/autonomous-dev-agent-ts`.trim();
}
