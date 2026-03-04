---
name: dev-agent-orchestration
description: SDK V2 Session API 기반 에이전트 오케스트레이션 패턴. layer2 코드 구현 시 참조.
---

# 에이전트 오케스트레이션

adev의 2계층은 Claude Agent SDK V2 Session API를 사용하여 에이전트를 실행한다.

## 핵심 패턴

unstable_v2_createSession()으로 세션 생성 → session.stream()으로 실행 + hooks로 모니터링.

Phase별 실행 방식이 다르다:
- DESIGN: session.stream() 1개 + Agent Teams env 활성화 (팀 토론)
- CODE: unstable_v2_prompt() ×N 동시 (Promise.all)
- TEST/VERIFY: unstable_v2_prompt() 순차

## 필수 옵션

```typescript
{
  settingSources: [],              // 파일시스템 설정 의존 없음
  permissionMode: 'bypassPermissions',  // 자율 운영
  env: { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" },  // DESIGN에서만
  allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
}
```

## Hook 기반 모니터링

```typescript
const hooks = {
  preToolUse: async (event) => { /* 도구 호출 전 검증 */ },
  postToolUse: async (event) => { /* 도구 호출 후 기록 */ },
  teammateIdle: async (event) => { /* 팀원 유휴 감지 */ },
};
```

상세 패턴: `references/v2-session-pattern.md`
알려진 이슈: `references/known-issues.md`
