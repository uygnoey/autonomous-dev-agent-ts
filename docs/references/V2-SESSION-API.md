# V2 Session API

## PoC 검증 결과

- `unstable_v2_createSession()` 정상 동작 확인
- `session.stream()` 스트리밍 정상
- Agent Teams (환경변수 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) 정상
- SDK 버전: `@anthropic-ai/claude-code` (최신)

## 핵심 패턴

```typescript
import { query } from '@anthropic-ai/claude-code';

// 독립 세션 (CODE/TEST/VERIFY Phase)
const result = await query({
  prompt: agentPrompt,
  options: {
    model: 'sonnet',
    systemPrompt: agentSystemPrompt,
    allowedTools: ['Read', 'Write', 'Bash'],
    maxTurns: 50,
  },
});

// Agent Teams (DESIGN Phase)
// 환경변수: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
// SDK가 자동으로 팀 협업 모드 활성화
```

## 알려진 이슈

### TeamDelete Race Condition
Agent Teams에서 에이전트 삭제 시 타이밍 문제 발생 가능.
대응: 삭제 전 상태 확인 + 재시도 로직.

### unstable API
`unstable_v2_*` 접두사는 API가 변경될 수 있음을 의미.
대응: AgentExecutor 추상화 레이어로 격리. SDK 업데이트 시 이 파일만 수정.

## 디스크 IPC 구조

Agent Teams 간 통신은 SDK 내부 메커니즘 사용.
추가 IPC 불필요 (이전 버전의 inbox 파일 방식 폐기됨).
