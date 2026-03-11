# V2 Session API

> 최종 갱신: 2026-03-11
> SDK: `@anthropic-ai/claude-agent-sdk@0.2.72`
> 구현 상태: **완전 구현** — 116 pass, 0 fail

## SDK 설치

```bash
bun add @anthropic-ai/claude-agent-sdk
```

## 핵심 API 3종

```typescript
import {
  unstable_v2_createSession,    // 멀티턴 세션
  unstable_v2_prompt,           // 단발성 one-shot
  unstable_v2_resumeSession,    // 세션 재개
} from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKSessionOptions } from '@anthropic-ai/claude-agent-sdk';
```

## SDKSessionOptions

```typescript
interface SDKSessionOptions {
  model: string;                       // 'claude-opus-4-6' 등
  permissionMode?: 'bypassPermissions' | 'default' | 'acceptEdits';
  executable?: 'bun' | 'node';
  env?: Record<string, string>;
  allowedTools?: string[];
  // ⚠️ systemPrompt, maxTurns, temperature 없음 (SDKSessionOptions에 미포함)
}
```

## 멀티턴 세션 패턴 (V2SessionExecutor 실제 구현)

```typescript
// 1. 세션 생성
const session = unstable_v2_createSession({
  model: 'claude-opus-4-6',
  permissionMode: 'bypassPermissions',
  executable: 'bun',
  env: {
    ANTHROPIC_API_KEY: 'sk-ant-xxx',
    // DESIGN Phase만: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'
  },
  allowedTools: ['Read', 'Write', 'Bash'],
});

// 2. 프롬프트 전송 (별도 호출 필수)
await session.send('Design the authentication module');

// 3. 스트림 수신
for await (const msg of session.stream()) {
  // msg.type === 'assistant' → text/tool_use 블록
  // msg.type === 'result'    → success(done) 또는 error
  // msg.type === 'system'    → init 등 (필터링)
}

// 4. 세션 종료
session.close();
```

## SDKMessage 타입 → AgentEvent 매핑

```
SDK SDKMessage                   AgentEvent (src/layer2/types.ts)
══════════════════════════════   ══════════════════════════════════════
type: 'assistant'
  content: [{ type:'tool_use' }] → type: 'tool_use'
                                     content: "Tool: {name}"
                                     metadata: { toolName, toolInput }

type: 'assistant'
  content: [{ type:'text' }]    → type: 'message'
                                     content: text (복수 블록: '\n' 조인)

type: 'result', subtype:'success' → type: 'done'
                                     content: msg.result
                                     metadata: { stopReason, cost }

type: 'result', subtype: 기타     → type: 'error'
                                     content: errors[0] ?? 'Execution failed'
                                     metadata: { subtype }

type: 'system', 기타              → null (필터링)
```

## 단발성 one-shot 패턴

```typescript
import { unstable_v2_prompt } from '@anthropic-ai/claude-agent-sdk';

const result = await unstable_v2_prompt('Your prompt here', {
  model: 'claude-opus-4-6',
  permissionMode: 'bypassPermissions',
  executable: 'bun',
  env: { ANTHROPIC_API_KEY: 'sk-ant-xxx' },
});

if (result.subtype === 'success') {
  console.log(result.result);  // 결과 문자열
}
```

## Agent Teams (DESIGN Phase)

```typescript
// DESIGN Phase만 활성화 — 다른 Phase는 키 미설정
const env: Record<string, string> = {
  ANTHROPIC_API_KEY: 'sk-ant-xxx',
};
if (phase === 'DESIGN') {
  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
}
// ⚠️ '0' 으로 설정하는 것이 아니라 키 자체를 미설정
```

## 세션 재개

```typescript
import { unstable_v2_resumeSession } from '@anthropic-ai/claude-agent-sdk';

const session = unstable_v2_resumeSession(sessionId, {
  model: 'claude-opus-4-6',
});
// send() 없이 stream()만 호출 (기존 컨텍스트 이어서)
for await (const msg of session.stream()) { ... }
```

## 세션 ID 형식

```
{projectId}:{featureId}:{agentName}:{phase}
예: "proj-001:feat-auth:architect:DESIGN"
```

## 알려진 이슈

### unstable API
`unstable_v2_*` 접두사는 API 변경 가능성을 의미.
대응: `AgentExecutor` 추상화로 격리. SDK 변경 시 `v2-session-factory.ts`만 수정.

### send() + stream() 분리 필수
구버전 `session.stream(prompt)` 패턴 사용 불가.
반드시 `await session.send(prompt)` → `session.stream()` 순서로 호출.

### Agent Teams 비활성화 방법
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0` (X)
→ 키를 env에 포함하지 않는 것이 올바른 비활성화 방법.
