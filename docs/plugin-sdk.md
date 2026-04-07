# Plugin SDK v2

adev Plugin SDK v2는 서드파티 플러그인이 adev 파이프라인에 참여할 수 있는 안정적인 API surface를 제공한다.

## 개요

플러그인은 **lifecycle hooks**를 통해 adev 파이프라인의 주요 시점에 개입한다:

1. **초기화** (`onInit`) — 플러그인 로드 직후
2. **Phase 전환** (`onPhaseChange`) — DESIGN → CODE → TEST 등 Phase 변경 시
3. **완료** (`onComplete`) — 파이프라인 종료 시
4. **해제** (`onDestroy`) — 플러그인 언로드 시

## 빠른 시작

### 1. 플러그인 디렉토리 생성

```
~/.adev/plugins/my-plugin/
  manifest.json
  index.ts
```

### 2. manifest.json 작성

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "내 커스텀 플러그인",
  "entryPoint": "index.ts",
  "capabilities": ["phase_hook"],
  "permissions": ["fs_read"],
  "dependencies": [],
  "minAdevVersion": "2.4.0"
}
```

### 3. 플러그인 구현

```typescript
import type { AdevPlugin } from 'core/plugin-types.js';

const myPlugin: AdevPlugin = {
  async onInit(ctx) {
    ctx.logger.info('My plugin initialized');
  },

  async onPhaseChange(ctx, info) {
    ctx.logger.info(`Phase: ${info.from ?? 'start'} → ${info.to}`);
    if (info.to === 'TEST') {
      ctx.emitEvent('pre_test_hook', { featureId: info.featureId });
    }
  },

  async onComplete(ctx, result) {
    ctx.logger.info(`Pipeline ${result.success ? 'succeeded' : 'failed'}`);
  },

  async onDestroy(ctx) {
    ctx.logger.info('Cleaning up');
  },
};

export default myPlugin;
```

## Manifest v2 스키마

`PluginManifestV2`는 v1을 확장하며 하위 호환성을 유지한다. v1 manifest는 자동으로 v2로 업그레이드된다.

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `name` | `string` | O | 플러그인 고유 이름 |
| `version` | `string` | O | semver 버전 (예: `"1.0.0"`) |
| `description` | `string` | - | 플러그인 설명 |
| `entryPoint` | `string` | O | 진입점 파일 경로 (상대 경로) |
| `capabilities` | `PluginCapability[]` | - | 제공하는 기능 목록 |
| `permissions` | `PluginPermission[]` | - | 요청하는 권한 목록 |
| `dependencies` | `PluginDependency[]` | - | 다른 플러그인 의존성 |
| `minAdevVersion` | `string` | - | 최소 adev 버전 |

### Capabilities

| 값 | 설명 |
|----|------|
| `mcp_server` | MCP 서버를 제공하는 플러그인 |
| `phase_hook` | Phase 전환 시 훅을 실행하는 플러그인 |
| `tool_provider` | 커스텀 도구를 제공하는 플러그인 |
| `agent_extension` | 에이전트 동작을 확장하는 플러그인 |

### Permissions

| 값 | 설명 |
|----|------|
| `fs_read` | 파일 시스템 읽기 |
| `fs_write` | 파일 시스템 쓰기 |
| `network` | 네트워크 접근 |
| `subprocess` | 서브프로세스 실행 |
| `rag_read` | RAG 벡터 DB 읽기 |
| `rag_write` | RAG 벡터 DB 쓰기 |

### Dependencies

```json
{
  "dependencies": [
    { "name": "other-plugin", "version": "^1.0.0" }
  ]
}
```

## AdevPlugin 인터페이스

모든 lifecycle hook은 optional이다. 구현한 hook만 호출된다.

```typescript
interface AdevPlugin {
  onInit?(ctx: PluginContext): Promise<void>;
  onPhaseChange?(ctx: PluginContext, info: PhaseChangeInfo): Promise<void>;
  onComplete?(ctx: PluginContext, result: PluginCompletionResult): Promise<void>;
  onDestroy?(ctx: PluginContext): Promise<void>;
}
```

### Hook 설명

| Hook | 시점 | 용도 |
|------|------|------|
| `onInit` | 플러그인 로드 직후 | 리소스 초기화, 설정 검증 |
| `onPhaseChange` | Phase 전환 시 | Phase별 커스텀 로직 실행 |
| `onComplete` | 파이프라인 종료 시 | 결과 보고, 정리 작업 |
| `onDestroy` | 플러그인 해제 시 | 리소스 해제, 연결 종료 |

## PluginContext

플러그인에 주입되는 컨텍스트 객체. 플러그인별로 격리된다.

```typescript
interface PluginContext {
  readonly logger: Logger;
  readonly config: PluginConfigAccess;
  emitEvent(eventName: string, data?: Record<string, unknown>): void;
}
```

### logger

플러그인 이름이 태그된 격리된 로거. 로그에 `{ plugin: "my-plugin" }` 컨텍스트가 자동 포함된다.

```typescript
ctx.logger.info('작업 시작');
ctx.logger.debug('상세 정보', { key: 'value' });
ctx.logger.error('실패', { error: String(err) });
```

### config

읽기 전용 설정 접근.

```typescript
interface PluginConfigAccess {
  readonly projectRoot: string;    // 프로젝트 루트 경로
  readonly adevVersion: string;    // 현재 adev 버전
  readonly pluginConfig: Readonly<Record<string, unknown>>; // 플러그인별 사용자 설정
}
```

### emitEvent

커스텀 이벤트를 발행한다. 다른 플러그인이나 adev 코어가 이벤트를 수신할 수 있다.

```typescript
ctx.emitEvent('analysis_complete', {
  fileCount: 42,
  duration: 1200,
});
```

## PhaseChangeInfo

Phase 전환 시 전달되는 정보.

```typescript
interface PhaseChangeInfo {
  readonly from: Phase | null;  // 이전 Phase (첫 Phase면 null)
  readonly to: Phase;           // 다음 Phase
  readonly featureId: string;   // 기능 ID
}
```

Phase 값: `'DESIGN'`, `'CODE'`, `'TEST'`, `'REVIEW'`, `'DEPLOY'` 등.

## PluginCompletionResult

파이프라인 완료 시 전달되는 결과.

```typescript
interface PluginCompletionResult {
  readonly success: boolean;
  readonly featureId: string;
  readonly phasesCompleted: readonly Phase[];
  readonly errorMessage?: string;
}
```

## PluginManager 사용법

`PluginManager`는 플러그인 전체 라이프사이클을 관리한다.

```typescript
import { PluginManager } from 'core/plugin-manager.js';

const manager = new PluginManager(logger, {
  projectRoot: '/path/to/project',
  adevVersion: '2.4.0',
  pluginConfig: {},
});

// 로드 + 초기화
const result = await manager.loadAndInitialize(
  '~/.adev/plugins',       // 글로벌 플러그인 디렉토리
  '/project/.adev/plugins', // 프로젝트 플러그인 디렉토리 (우선)
);

// Phase 전환 알림
await manager.onPhaseChange({
  from: 'DESIGN',
  to: 'CODE',
  featureId: 'feat-auth',
});

// 파이프라인 완료 알림
await manager.onComplete({
  success: true,
  featureId: 'feat-auth',
  phasesCompleted: ['DESIGN', 'CODE', 'TEST'],
});

// 정리
await manager.destroyAll();
```

### 플러그인 조회

```typescript
const plugin = manager.getPlugin('my-plugin');
if (plugin) {
  console.log(plugin.manifest.version);
  console.log(plugin.status); // 'loaded' | 'initialized' | 'error' | 'destroyed'
}

const allPlugins = manager.listPlugins();
```

## 플러그인 디렉토리 구조

플러그인은 두 위치에서 로드된다:

1. **글로벌**: `~/.adev/plugins/` — 모든 프로젝트에서 사용 가능
2. **프로젝트**: `{project}/.adev/plugins/` — 해당 프로젝트에서만 사용

프로젝트 플러그인이 동일 이름의 글로벌 플러그인을 덮어쓴다.

```
~/.adev/plugins/
  my-global-plugin/
    manifest.json
    index.ts

/project/.adev/plugins/
  my-project-plugin/
    manifest.json
    index.ts
```

## Export 방식

플러그인은 세 가지 export 방식을 지원한다 (우선순위 순):

```typescript
// 1. default export (권장)
const plugin: AdevPlugin = { onInit: async (ctx) => { /* ... */ } };
export default plugin;

// 2. named export 'plugin'
export const plugin: AdevPlugin = { onInit: async (ctx) => { /* ... */ } };

// 3. 모듈 자체가 AdevPlugin 형태
export async function onInit(ctx: PluginContext) { /* ... */ }
export async function onPhaseChange(ctx: PluginContext, info: PhaseChangeInfo) { /* ... */ }
```

## v1 → v2 마이그레이션

v1 manifest는 자동으로 v2로 변환된다. 추가 작업 없이 기존 플러그인이 동작한다.

v2 기능을 활용하려면 manifest.json에 새 필드를 추가하면 된다:

```diff
 {
   "name": "my-plugin",
   "version": "1.0.0",
   "entryPoint": "index.ts",
+  "capabilities": ["phase_hook"],
+  "permissions": ["fs_read"],
+  "minAdevVersion": "2.4.0"
 }
```

## 에러 처리

- 개별 플러그인의 hook 실패는 다른 플러그인에 영향을 주지 않는다.
- 실패한 플러그인은 `status: 'error'`로 표시되고, 이후 hook 호출에서 건너뛴다.
- 모든 에러는 플러그인별 로거에 기록된다.

## 보안

- `entryPoint`에 path traversal (`..`, 절대 경로)이 감지되면 플러그인 로드가 거부된다.
- `permissions` 필드로 플러그인이 요청하는 시스템 접근을 선언한다.
- 플러그인은 `PluginContext`를 통해서만 adev 시스템과 상호작용한다.
