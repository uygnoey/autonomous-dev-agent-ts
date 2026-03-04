# V2 Session API 패턴 상세

출처: PoC 검증 (SDK v0.2.63, 5/5 PASS, $3.881) — github.com/uygnoey/adev-poc-guide

## AgentExecutor 추상화

```typescript
interface AgentConfig {
  prompt: string;
  options: {
    systemPrompt?: string;
    permissionMode: 'bypassPermissions';
    settingSources: [];
    model?: string;
    allowedTools?: string[];
    env?: Record<string, string>;
  };
  hooks?: StreamHooks;
}

interface AgentEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'teammate_message' | 'error' | 'done';
  data: unknown;
  timestamp: Date;
}

interface AgentExecutor {
  execute(config: AgentConfig): AsyncIterable<AgentEvent>;
}
```

## V2SessionExecutor 구현

```typescript
import { unstable_v2_createSession, unstable_v2_prompt } from '@anthropic-ai/claude-code';

class V2SessionExecutor implements AgentExecutor {
  async *execute(config: AgentConfig): AsyncIterable<AgentEvent> {
    const session = unstable_v2_createSession({
      systemPrompt: config.options.systemPrompt,
      permissionMode: config.options.permissionMode,
      env: config.options.env,
    });

    for await (const event of session.stream(config.prompt, {
      preToolUse: config.hooks?.preToolUse,
      postToolUse: config.hooks?.postToolUse,
      teammateIdle: config.hooks?.teammateIdle,
    })) {
      yield this.mapEvent(event);
    }
  }

  private mapEvent(raw: unknown): AgentEvent {
    // SDK 이벤트를 AgentEvent로 변환
    // 구현 시 SDK 실제 이벤트 타입에 맞춰 매핑
  }
}
```

## 단발성 실행 (CODE/TEST/VERIFY)

```typescript
async function executePrompt(prompt: string, options: PromptOptions): Promise<Result<string>> {
  try {
    const result = await unstable_v2_prompt(prompt, {
      permissionMode: 'bypassPermissions',
      settingSources: [],
      allowedTools: options.allowedTools,
    });
    return { ok: true, value: result };
  } catch (error) {
    return { ok: false, error: new AgentError('prompt_failed', String(error)) };
  }
}
```

## DESIGN Phase — Agent Teams 패턴

```typescript
async function runDesignPhase(spec: string): Promise<Result<DesignOutput>> {
  const session = unstable_v2_createSession({
    systemPrompt: 'You are the lead architect...',
    permissionMode: 'bypassPermissions',
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
  });

  const hooks = {
    preToolUse: async (event: PreToolUseEvent) => {
      // TeamCreate, SendMessage 등 Agent Teams 도구 호출 감시
      if (event.toolName === 'TeamCreate') { /* 팀 생성 기록 */ }
    },
    postToolUse: async (event: PostToolUseEvent) => {
      // 도구 실행 결과 LanceDB 저장
    },
    teammateIdle: async (event: TeammateIdleEvent) => {
      // 팀원 유휴 → 토론 완료 신호 가능
    },
  };

  for await (const event of session.stream(spec, hooks)) {
    // 스트림 이벤트 처리 + 이상 패턴 감지
  }
}
```

## 디스크 IPC 구조 (Agent Teams 모니터링 보완)

```
~/.claude/
├── teams/{team-name}/
│   ├── config.json          ← 팀 설정 + 멤버 목록
│   └── inboxes/
│       └── {agent}.json     ← {from, text, summary, timestamp, read}
└── tasks/{team-name}/
    ├── .lock
    └── {id}.json            ← 태스크 정의
```

Hook + 디스크 IPC 폴링 조합으로 완전 가시성 확보.
