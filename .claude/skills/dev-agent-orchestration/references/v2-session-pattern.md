# V2 Session API 패턴 상세

> 최종 갱신: 2026-03-11
> SDK: `@anthropic-ai/claude-agent-sdk@0.2.72`
> 구현 파일: `src/layer2/v2-session-factory.ts`, `src/layer2/v2-session-executor.ts`

## 실제 구현된 API 패턴

### ⚠️ send() + stream() 분리 필수 (구버전 session.stream(prompt) 불가)

```typescript
import {
  unstable_v2_createSession,
  unstable_v2_prompt,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKSessionOptions } from '@anthropic-ai/claude-agent-sdk';
```

## SDKSessionOptions (실제 지원 필드만)

```typescript
const sessionOptions: SDKSessionOptions = {
  model: 'claude-opus-4-6',
  permissionMode: 'bypassPermissions',
  executable: 'bun',
  env: {
    ANTHROPIC_API_KEY: 'sk-ant-xxx',
    // DESIGN Phase만: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'
  },
  allowedTools: ['Read', 'Write', 'Bash'],
  // ⚠️ 없는 필드: systemPrompt, maxTurns, temperature, settingSources
};
```

## V2SessionExecutor 실제 구현

```typescript
import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk';

class V2SessionExecutor implements AgentExecutor {
  async *execute(config: AgentConfig): AsyncIterable<AgentEvent> {
    const session = unstable_v2_createSession({
      model: 'claude-opus-4-6',
      permissionMode: 'bypassPermissions',
      executable: 'bun',
      env: buildEnv(config),              // 인증 + AGENT_TEAMS
      allowedTools: config.tools,
    });

    // ⚠️ send() 먼저, stream()은 그 다음
    await session.send(config.prompt);
    for await (const msg of session.stream()) {
      const event = mapSdkEvent(msg, config.name, logUnhandled);
      if (event) yield event;
      if (event?.type === 'done') {
        session.close();
      }
    }
  }
}
```

## SDKMessage → AgentEvent 매핑

```typescript
function mapSdkEvent(msg: SDKMessage, agentName: AgentName): AgentEvent | null {
  switch (msg.type) {
    case 'assistant': {
      const blocks = msg.message.content;
      // tool_use 블록 우선
      const toolBlock = blocks.find((b) => b.type === 'tool_use');
      if (toolBlock) return { type: 'tool_use', content: `Tool: ${toolBlock.name}`,
                               metadata: { toolName: toolBlock.name, toolInput: toolBlock.input } };
      // text 블록 (복수면 '\n' 조인)
      const textBlocks = blocks.filter((b) => b.type === 'text');
      if (textBlocks.length > 0)
        return { type: 'message', content: textBlocks.map((b) => b.text).join('\n') };
      return null; // 빈 content → 필터링
    }
    case 'result':
      if (msg.subtype === 'success')
        return { type: 'done', content: msg.result,
                 metadata: { stopReason: msg.stop_reason, cost: msg.total_cost_usd } };
      return { type: 'error', content: msg.errors?.[0] ?? 'Execution failed',
               metadata: { subtype: msg.subtype } };
    default:
      return null; // system, 기타 → 필터링
  }
}
```

## Agent Teams 환경변수

```typescript
// DESIGN Phase만 '1' 설정, 기타 Phase는 키 자체를 미설정
if (config.phase === 'DESIGN') {
  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
}
// ❌ 잘못된 패턴: env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '0' (비활성화 목적)
// ✅ 올바른 패턴: 키를 env에 포함하지 않음
```

## 단발성 one-shot

```typescript
const result = await unstable_v2_prompt(message, {
  model: 'claude-opus-4-6',
  permissionMode: 'bypassPermissions',
  executable: 'bun',
  env: { ANTHROPIC_API_KEY: 'sk-ant-xxx' },
});
if (result.subtype === 'success') {
  return ok(result.result);
}
return err(new AgentError('agent_execution_failed', result.errors?.[0] ?? 'Failed'));
```

## 세션 재개

```typescript
// 메모리에 저장된 세션이 없을 때 SDK로 복원
const session = unstable_v2_resumeSession(sessionId, { model: 'claude-opus-4-6' });
// send() 없이 stream()만 호출
for await (const msg of session.stream()) { ... }
```
