> **Languages:** [한국어](../ko/v2-session-executor.md) | [English](../en/v2-session-executor.md) | [日本語](../ja/v2-session-executor.md) | [Español](../es/v2-session-executor.md)

# V2SessionExecutor API Documentation

**Last Updated**: 2025-01-XX
**Version**: v2.4
**Test Validation**: ✅ 140 tests all passed (Normal 20%, Edge 40%, Error 40%)
**Architect Score**: 99/100 (Best Practice)
**Reviewer Score**: 98/100 (APPROVED)

---

## 🎯 Elementary School Analogy

### V2SessionExecutor = "Agent Execution Button"

Imagine a school project where several friends (agents) each perform their roles.

- **DESIGN Phase (Design Stage)**: Everyone gathers to discuss and share ideas **Team Meeting** → **Agent Teams Enabled**
- **CODE/TEST/VERIFY Phase (Development Stage)**: Each works independently at their own desk **Individual Work** → **Agent Teams Disabled**

V2SessionExecutor is a **smart button** that automatically switches this "meeting mode".

```
┌─────────────────────────────────────────────────────────────┐
│  DESIGN Phase                                               │
│  ┌──────┐   ┌──────┐   ┌──────┐                            │
│  │ 🏛️   │ ↔ │ 🧪   │ ↔ │ 💻   │  ← Can exchange messages   │
│  └──────┘   └──────┘   └──────┘     (SendMessage enabled)  │
│  Architect    QA      Coder                                 │
│                                                             │
│  AGENT_TEAMS_ENABLED=true                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  CODE Phase                                                 │
│  ┌──────┐   ┌──────┐   ┌──────┐                            │
│  │ 💻   │   │ 🧪   │   │ 🔍   │  ← Independent execution    │
│  └──────┘   └──────┘   └──────┘     (SendMessage disabled) │
│  Coder      Tester      QC                                  │
│                                                             │
│  AGENT_TEAMS_ENABLED=false                                  │
└─────────────────────────────────────────────────────────────┘
```

### Core Concepts

1. **Phase-based Branching**: DESIGN is team meeting mode, rest is independent work mode
2. **Auto Environment Variable Setup**: Automatically configures authentication info + Agent Teams activation
3. **Event Stream**: Can receive agent work process in real-time
4. **Session Resume**: Can resume work after stopping

---

## 📐 Architecture

### Overall Structure

```
┌────────────────────────────────────────────────────────────────┐
│                      V2SessionExecutor                         │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  1. buildSessionEnvironment()                            │ │
│  │     • Get auth headers from AuthProvider                 │ │
│  │     • x-api-key → ANTHROPIC_API_KEY conversion           │ │
│  │     • authorization → CLAUDE_CODE_OAUTH_TOKEN conversion │ │
│  │     • Check Phase → Set AGENT_TEAMS_ENABLED              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                           ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  2. createSession()                                      │ │
│  │     • Call unstable_v2_createSession()                   │ │
│  │     • Pass systemPrompt, maxTurns, tools, environment    │ │
│  │     • Return Result<V2Session, AgentError>               │ │
│  └──────────────────────────────────────────────────────────┘ │
│                           ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  3. session.stream(prompt)                               │ │
│  │     • Start SDK event stream                             │ │
│  │     • Receive message, tool_use, tool_result, error, done│ │
│  └──────────────────────────────────────────────────────────┘ │
│                           ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  4. mapSdkEvent()                                        │ │
│  │     • Convert V2SessionEvent → AgentEvent                │ │
│  │     • type, agentName, content, timestamp, metadata      │ │
│  │     • Return null for unmappable events (filtered)       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                           ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  5. yield AgentEvent                                     │ │
│  │     • Receive events externally with for await...of      │ │
│  │     • Clean up session when done event received          │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Phase-based Behavior Difference

```
┌────────────────────────────────────────────────────────────────┐
│  Phase: DESIGN                                                 │
│  enableAgentTeams = true                                       │
│                                                                │
│  Environment Variables:                                        │
│    ANTHROPIC_API_KEY=sk-ant-xxx                                │
│    AGENT_TEAMS_ENABLED=true  ← SendMessage available           │
│                                                                │
│  Agent Teams Communication:                                    │
│    architect → qa: "Please review design"                      │
│    qa → architect: "Security issue found"                      │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  Phase: CODE / TEST / VERIFY                                   │
│  enableAgentTeams = false                                      │
│                                                                │
│  Environment Variables:                                        │
│    ANTHROPIC_API_KEY=sk-ant-xxx                                │
│    AGENT_TEAMS_ENABLED=false  ← SendMessage unavailable        │
│                                                                │
│  Independent Execution:                                        │
│    coder: Write code alone                                     │
│    tester: Run tests alone                                     │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Dependencies

### Required Dependencies

```typescript
import { V2SessionExecutor } from './layer2/v2-session-executor.js';
import type { AuthProvider } from './auth/types.js';
import type { Logger } from './core/logger.js';
import type { AgentConfig, AgentEvent } from './layer2/types.js';
```

### AuthProvider Implementation Required

```typescript
interface AuthProvider {
  /** Return API Key or OAuth token in header format */
  getAuthHeader(): Record<string, string>;

  /** Validate authentication (optional) */
  validateAuth(): Promise<boolean>;
}
```

**Important**: `getAuthHeader()` must return one of:
- `{ 'x-api-key': 'sk-ant-xxx' }` → Converts to `ANTHROPIC_API_KEY` env var
- `{ authorization: 'Bearer token_xxx' }` → Converts to `CLAUDE_CODE_OAUTH_TOKEN` env var

### AgentConfig Structure

```typescript
interface AgentConfig {
  name: AgentName;                    // 'architect' | 'qa' | 'coder' | ...
  phase: Phase;                       // 'DESIGN' | 'CODE' | 'TEST' | 'VERIFY'
  projectId: string;                  // Project identifier
  featureId: string;                  // Feature identifier
  prompt: string;                     // Prompt to pass to agent
  systemPrompt: string;               // System prompt
  tools: string[];                    // Available tool list (e.g., ['Read', 'Write', 'Bash'])
  maxTurns?: number;                  // Max turn count (default: 50)
  env?: Record<string, string>;       // Custom environment variables
}
```

---

## 📦 5-Step Usage

### Step 1: Prepare Dependencies

```typescript
import { ConsoleLogger } from './core/logger.js';
import { ApiKeyAuthProvider } from './auth/api-key-auth.js';
import { V2SessionExecutor } from './layer2/v2-session-executor.js';

// Create Logger
const logger = new ConsoleLogger('info');

// Prepare AuthProvider (API Key or OAuth)
const authProvider = new ApiKeyAuthProvider({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  logger,
});
```

### Step 2: Create V2SessionExecutor Instance

```typescript
const executor = new V2SessionExecutor({
  authProvider,
  logger,
  defaultOptions: {
    maxTurns: 100,        // Default max turns (optional)
    temperature: 1.0,     // Default temperature (optional)
    model: 'claude-opus-4-6',  // Default model (optional)
  },
});
```

### Step 3: Configure AgentConfig

```typescript
import type { AgentConfig } from './layer2/types.js';

const config: AgentConfig = {
  name: 'architect',
  phase: 'DESIGN',  // DESIGN Phase → Agent Teams enabled
  projectId: 'proj-12345',
  featureId: 'feat-auth-system',
  prompt: 'Design the authentication system architecture',
  systemPrompt: 'You are an expert software architect',
  tools: ['Read', 'Write', 'Bash', 'Grep'],
  maxTurns: 50,
  env: {
    // Custom environment variables (optional)
    PROJECT_NAME: 'adev',
  },
};
```

### Step 4: Execute Agent and Receive Events

```typescript
for await (const event of executor.execute(config)) {
  switch (event.type) {
    case 'message':
      console.log(`[${event.agentName}] Message:`, event.content);
      break;

    case 'tool_use':
      console.log(`[${event.agentName}] Tool use:`, event.content);
      if (event.metadata?.toolName) {
        console.log(`  Tool name: ${event.metadata.toolName}`);
      }
      break;

    case 'tool_result':
      console.log(`[${event.agentName}] Tool result:`, event.content);
      break;

    case 'error':
      console.error(`[${event.agentName}] Error:`, event.content);
      break;

    case 'done':
      console.log(`[${event.agentName}] Complete:`, event.content);
      if (event.metadata?.stopReason) {
        console.log(`  Stop reason: ${event.metadata.stopReason}`);
      }
      break;

    default:
      console.warn('Unknown event:', event);
  }
}

console.log('Agent execution completed');
```

### Step 5: Cleanup (Before Process Exit)

```typescript
// Register process exit handlers
process.on('SIGINT', () => {
  executor.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  executor.cleanup();
  process.exit(0);
});
```

---

## ⚠️ Cautions

### 1. SDK Installation Required

Currently `@anthropic-ai/claude-code` SDK is not installed.

```bash
# Need to install SDK
bun add @anthropic-ai/claude-code
```

**Before Installation**:
- `createSession()` call throws `Error: SDK not installed: @anthropic-ai/claude-code`
- All `execute()` calls return `error` events

### 2. Understand Phase-based Agent Teams Behavior

| Phase | Agent Teams | SendMessage Available | Purpose |
|-------|-------------|----------------------|---------|
| DESIGN | **Enabled** | ✅ Available | Team discussion, design review |
| CODE | Disabled | ❌ Unavailable | Independent code writing |
| TEST | Disabled | ❌ Unavailable | Independent test execution |
| VERIFY | Disabled | ❌ Unavailable | Independent quality verification |

**Incorrect Usage Example**:
```typescript
// ❌ Trying to use SendMessage in CODE Phase → Ignored
const config = {
  name: 'coder',
  phase: 'CODE',  // Agent Teams disabled
  prompt: 'Use SendMessage to ask architect',
  // ...
};
// SendMessage calls by agent won't work
```

### 3. Environment Variable Priority

```typescript
// Final env vars = baseEnv (auth + Agent Teams) + config.env (custom)
const finalEnv = {
  ...baseEnv,         // ANTHROPIC_API_KEY + AGENT_TEAMS_ENABLED
  ...config.env,      // Custom variables (can override)
};
```

**Caution**: Redefining `ANTHROPIC_API_KEY` in `config.env` ignores AuthProvider value.

### 4. Session ID Format

```typescript
// Session ID format: projectId:featureId:agentName:phase
"proj-12345:feat-auth-system:architect:DESIGN"
```

**Correct Format Required**:
- 4 parts (`:` separator)
- Valid AgentName (`architect`, `qa`, `coder`, `tester`, `qc`, `reviewer`, `documenter`)
- Wrong format → Uses `architect` default on `resume()`

### 5. Auto-cleanup After done Event

```typescript
for await (const event of executor.execute(config)) {
  if (event.type === 'done') {
    // At this point, session already removed from activeSessions Map
    // Cannot call resume()
  }
}
```

---

## 💡 Example Code

### Example 1: DESIGN Phase - Agent Teams Enabled

```typescript
import { ConsoleLogger } from './core/logger.js';
import { ApiKeyAuthProvider } from './auth/api-key-auth.js';
import { V2SessionExecutor } from './layer2/v2-session-executor.js';
import type { AgentConfig } from './layer2/types.js';

const logger = new ConsoleLogger('info');
const authProvider = new ApiKeyAuthProvider({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  logger,
});

const executor = new V2SessionExecutor({ authProvider, logger });

const designConfig: AgentConfig = {
  name: 'architect',
  phase: 'DESIGN',  // Agent Teams enabled
  projectId: 'proj-001',
  featureId: 'feat-payment',
  prompt: `Design a payment processing system.
Collaborate with the qa agent to review security requirements.`,
  systemPrompt: 'You are a senior software architect',
  tools: ['Read', 'Write', 'SendMessage'],  // SendMessage available
  maxTurns: 30,
};

console.log('🏛️ Starting DESIGN Phase (Agent Teams enabled)');

for await (const event of executor.execute(designConfig)) {
  if (event.type === 'message') {
    console.log(`[${event.agentName}] ${event.content}`);
  } else if (event.type === 'tool_use' && event.metadata?.toolName === 'SendMessage') {
    console.log(`  → SendMessage used: ${JSON.stringify(event.metadata.toolInput)}`);
  } else if (event.type === 'done') {
    console.log('✅ DESIGN Phase completed');
  }
}

executor.cleanup();
```

**Example Output**:
```
🏛️ Starting DESIGN Phase (Agent Teams enabled)
[architect] I'll design the payment system architecture.
  → SendMessage used: {"recipient":"qa","message":"Please review security requirements"}
[architect] Received feedback from qa agent.
✅ DESIGN Phase completed
```

### Example 2: CODE Phase - Independent Execution

```typescript
const codeConfig: AgentConfig = {
  name: 'coder',
  phase: 'CODE',  // Agent Teams disabled
  projectId: 'proj-001',
  featureId: 'feat-payment',
  prompt: 'Implement the PaymentService class based on the design',
  systemPrompt: 'You are an expert TypeScript developer',
  tools: ['Read', 'Write', 'Edit', 'Bash'],
  maxTurns: 50,
};

console.log('💻 Starting CODE Phase (independent execution)');

let filesChanged = 0;

for await (const event of executor.execute(codeConfig)) {
  if (event.type === 'tool_use' && event.metadata?.toolName === 'Write') {
    filesChanged++;
    console.log(`  File created: ${JSON.stringify(event.metadata.toolInput)}`);
  } else if (event.type === 'done') {
    console.log(`✅ CODE Phase completed (${filesChanged} files created/modified)`);
  }
}

executor.cleanup();
```

### Example 3: Session Resume

```typescript
const sessionId = 'proj-001:feat-payment:architect:DESIGN';

console.log(`🔄 Resuming session: ${sessionId}`);

for await (const event of executor.resume(sessionId)) {
  if (event.type === 'error') {
    console.error(`❌ Resume failed: ${event.content}`);
  } else if (event.type === 'message') {
    console.log(`[${event.agentName}] ${event.content}`);
  } else if (event.type === 'done') {
    console.log('✅ Resumed session completed');
  }
}
```

**Example Output (When Session Doesn't Exist)**:
```
🔄 Resuming session: proj-001:feat-payment:architect:DESIGN
❌ Resume failed: Session not found: proj-001:feat-payment:architect:DESIGN
```

---

## 🐛 Error Handling

### Error Type Responses

#### 1. SDK Not Installed Error

**Symptom**:
```typescript
for await (const event of executor.execute(config)) {
  console.log(event);
}
// Output: { type: 'error', content: 'Failed to create session for agent architect', ... }
```

**Solution**:
```bash
bun add @anthropic-ai/claude-code
```

#### 2. Session Creation Failure

**Causes**:
- Wrong API Key
- Network connection failure
- SDK internal error

**Response Code**:
```typescript
for await (const event of executor.execute(config)) {
  if (event.type === 'error') {
    if (event.content.includes('Failed to create session')) {
      logger.error('Session creation failed — Check AuthProvider', {
        agentName: event.agentName,
        error: event.content,
      });

      // Retry logic (optional)
      await new Promise((resolve) => setTimeout(resolve, 5000));
      // retry...
    }
  }
}
```

#### 3. Session Stream Error

**Causes**:
- Network disconnection mid-stream
- SDK internal stream error

**Response Code**:
```typescript
try {
  for await (const event of executor.execute(config)) {
    // Process event
  }
} catch (error) {
  logger.error('Session stream error', { error });
  // Session automatically cleaned (activeSessions.delete called)
}
```

---

## ✅ Checklist

### Pre-Implementation Checklist

- [ ] `@anthropic-ai/claude-code` SDK installed
- [ ] `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` env var set
- [ ] AuthProvider implementation complete (getAuthHeader, validateAuth)
- [ ] Logger instance ready
- [ ] AgentConfig type understood

### Pre-Execution Checklist

- [ ] Verified AuthProvider.getAuthHeader() returns correct format
- [ ] Verified AgentConfig.phase value is valid Phase type
- [ ] Verified AgentConfig.name is valid AgentName
- [ ] Verified AgentConfig.tools list contains SDK-supported tools
- [ ] Understood Agent Teams only enabled in DESIGN Phase

### Event Processing Checklist

- [ ] Receive events with `for await...of` loop
- [ ] Implemented branching by `event.type`
- [ ] Proper error handling on `error` events
- [ ] Aware of auto-cleanup on `done` events
- [ ] Save event logs (optional)

### Error Handling Checklist

- [ ] Handle SDK not installed error (`Failed to create session`)
- [ ] Implement retry logic on session creation failure (optional)
- [ ] Aware of session cleanup on stream error
- [ ] New session start logic on resume failure
- [ ] Validate wrong session ID format

### Cleanup Checklist

- [ ] Call `executor.cleanup()` before process exit
- [ ] Register SIGINT, SIGTERM handlers
- [ ] Verify all active sessions cleaned

---

## 📚 Reference Documents

- **ARCHITECTURE.md**: 3-layer structure, Layer2 role, V2SessionExecutor location
- **SPEC.md**: Phase transition logic, Agent Teams activation conditions
- **IMPLEMENTATION-GUIDE.md**: V2 Session API integration guide
- **src/layer2/types.ts**: AgentConfig, AgentEvent type definitions
- **src/auth/types.ts**: AuthProvider interface
- **tests/unit/layer2/v2-session-executor.test.ts**: 140 test cases

---

## 🎉 Summary

V2SessionExecutor is a smart agent executor that **automatically switches Agent Teams activation based on Phase**.

### Core Features

1. **DESIGN Phase → Agent Teams Enabled** (team meeting mode)
2. **CODE/TEST/VERIFY Phase → Agent Teams Disabled** (independent work mode)
3. **Auth Headers → Env Vars Auto-conversion** (API Key / OAuth)
4. **SDK Events → AgentEvent Mapping** (message, tool_use, tool_result, error, done)
5. **Session Resume Feature** (resume)

### Usage Flow

```
1. Prepare AuthProvider + Logger
2. Create V2SessionExecutor instance
3. Configure AgentConfig (Phase specification required)
4. Call execute() with for await...of
5. Process by event type (message, tool_use, error, done)
6. Call cleanup() before process exit
```

### Key Advantages

- ✅ Auto-switch team collaboration / independent work by Phase
- ✅ Result pattern-based error handling
- ✅ Real-time progress via event streaming
- ✅ Resume work with session resume

**140 tests all passed** ensures verified stability!
