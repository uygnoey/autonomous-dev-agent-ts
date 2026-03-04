> **Languages:** [한국어](../ko/mcp-manager.md) | [English](../en/mcp-manager.md) | [日本語](../ja/mcp-manager.md) | [Español](../es/mcp-manager.md)

# McpManager API ドキュメント

**最終更新**: 2025-01-XX
**バージョン**: v2.4
**テスト検証**: ✅ 140テスト全て合格 (Normal 20%, Edge 40%, Error 40%)
**Architect評価**: 95/100 (APPROVED)
**Reviewer評価**: 95/100 (APPROVED)

---

## 🎯 小学生でもわかる例え

### McpManager = "おもちゃロボットリモコン"

家にいくつかのおもちゃロボット（MCPサーバー）があると想像してください。

- **McpRegistry** = ロボットリスト帳 (どのロボットがあるか記録)
- **McpLoader** = ロボット説明書を読む機械 (設定ファイル読み込み)
- **McpManager** = 統合リモコン (ロボットをオン/オフ、状態確認)

### 核心概念

1. **初期化 (initialize)**: 設定ファイルを読んでどのロボットがあるか把握
2. **開始 (startServer)**: 特定のロボットをオンにする (状態: stopped → running)
3. **停止 (stopServer)**: 特定のロボットをオフにする (状態: running → stopped)
4. **状態確認 (getStatus)**: ロボットがオンかオフか確認
5. **全停止 (stopAll)**: すべてのロボットを一度にオフにする
6. **ヘルスチェック (healthCheck)**: すべてのロボットの状態を一目で確認
7. **ツールリスト (listTools)**: オンのロボットが提供するツールを確認

**重要**: 実際のロボット（プロセス）を作るのはLayer2の役割です。McpManagerは **状態のみを管理** します!

---

## 📐 アーキテクチャ

### 全体構造図

```
┌────────────────────────────────────────────────────────────────┐
│                        McpManager                              │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ McpRegistry  │  │  McpLoader   │  │    Logger    │         │
│  │ - servers    │  │ - loadGlobal │  │ - info()     │         │
│  │ - register() │  │ - loadProject│  │ - warn()     │         │
│  │ - getServer()│  │ - merge()    │  │ - error()    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│         ↓                  ↓                 ↓                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │          instances: Map<string, McpServerInstance>       │ │
│  │  "git" → { config, status: 'running', tools, startedAt }│ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 初期化フロー

```
1. McpManager.initialize(globalDir, projectDir)
2. McpLoader.loadAndMerge(globalDir, projectDir)
   → グローバル設定読み込み
   → プロジェクト設定読み込み (オプション)
   → 設定マージ (プロジェクト設定が優先)
3. McpRegistry.clear() + instances.clear()
4. 各設定をレジストリに登録
5. Result<void> 返却
```

### サーバー開始フロー

```
1. McpManager.startServer(name)
2. McpRegistry.getServer(name) → サーバー設定取得
3. 検証:
   - ない? → err(mcp_server_not_found)
   - 無効化? → err(mcp_server_disabled)
   - すでに実行中? → err(mcp_server_already_running)
4. McpServerInstance生成
5. instances.set(name, instance) → マップに保存
6. Result<McpServerInstance> 返却
```

### 状態管理ライフサイクル

```
┌─────────────┐
│   stopped   │  ← 初期状態 (レジストリ登録直後)
└─────────────┘
      │ startServer()
      ↓
┌─────────────┐
│   running   │  ← 実行中 (ツール使用可能)
└─────────────┘
      │ stopServer()
      ↓
┌─────────────┐
│   stopped   │  ← 停止 (ツール使用不可)
└─────────────┘
```

---

## 🔧 依存性

### 必須依存性

```typescript
import { McpManager } from './mcp/mcp-manager.js';
import { McpRegistry } from './mcp/registry.js';
import { McpLoader } from './mcp/loader.js';
import type { Logger } from './core/logger.js';
import type { McpServerInstance, McpServerStatus, McpTool } from './mcp/types.js';
```

### タイプ定義

```typescript
interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  env?: Record<string, string>;
}

interface McpServerInstance {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpTool[];
  startedAt: Date;
}

type McpServerStatus = 'stopped' | 'running';

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}
```

---

## 📦 5ステップ使用法

### ステップ 1: 依存性準備

```typescript
import { ConsoleLogger } from './core/logger.js';
import { McpRegistry } from './mcp/registry.js';
import { McpLoader } from './mcp/loader.js';
import { McpManager } from './mcp/mcp-manager.js';

// Logger生成
const logger = new ConsoleLogger('info');

// RegistryとLoader生成
const registry = new McpRegistry(logger);
const loader = new McpLoader(logger);
```

### ステップ 2: McpManager インスタンス生成

```typescript
const manager = new McpManager(registry, loader, logger);
```

### ステップ 3: 設定初期化

```typescript
const globalDir = '~/.adev/mcp';      // グローバルMCP設定
const projectDir = './project/.adev/mcp';  // プロジェクトローカル設定 (オプション)

const initResult = await manager.initialize(globalDir, projectDir);

if (!initResult.ok) {
  logger.error('MCPマネージャー初期化失敗', { error: initResult.error.message });
  throw initResult.error;
}

logger.info('MCPマネージャー初期化完了');
```

### ステップ 4: サーバー開始および管理

```typescript
// サーバー開始
const startResult = manager.startServer('git');

if (!startResult.ok) {
  logger.error('サーバー開始失敗', { error: startResult.error.message });
} else {
  logger.info('サーバー開始成功', {
    name: startResult.value.config.name,
    status: startResult.value.status,
    startedAt: startResult.value.startedAt,
  });
}

// 状態確認
const status = manager.getStatus('git');
console.log(`gitサーバー状態: ${status}`);  // 出力: gitサーバー状態: running

// ツールリスト取得
const tools = manager.listTools();
console.log(`使用可能なツール: ${tools.length}個`);
```

### ステップ 5: 整理 (プロセス終了前)

```typescript
// すべてのサーバー停止
const stopAllResult = manager.stopAll();

if (stopAllResult.ok) {
  logger.info('すべてのMCPサーバー停止完了');
}

// または個別サーバー停止
const stopResult = manager.stopServer('git');

if (stopResult.ok) {
  logger.info('gitサーバー停止完了');
}
```

---

## ⚠️ 注意事項

### 1. 状態管理のみ担当

McpManagerは **実際のプロセスを生成または終了しません**。

```typescript
// ✅ 実際の動作
startServer('git');
// → instances Mapに 'git': { status: 'running', ... } 保存
// → 実際のプロセス生成はLayer2が担当

stopServer('git');
// → instance.status = 'stopped'
// → 実際のプロセス終了はLayer2が担当
```

**Layer2の役割** (adevでは未実装 — 今後拡張):
```typescript
// 例: Layer2で実際のプロセス生成
const processResult = await spawnMcpServer(config);
if (processResult.ok) {
  manager.startServer(config.name);  // 状態のみ更新
}
```

### 2. 初期化必須

サーバー操作前に必ず `initialize()` を呼び出す必要があります。

```typescript
// ❌ 間違った使用
const manager = new McpManager(registry, loader, logger);
manager.startServer('git');  // エラー! registryが空

// ✅ 正しい使用
const manager = new McpManager(registry, loader, logger);
await manager.initialize(globalDir);
manager.startServer('git');  // 正常動作
```

### 3. サーバー名重複防止

同じ名前のサーバーを複数回登録すると **最後の設定が維持** されます。

```typescript
// グローバル設定: ~/.adev/mcp/git/mcp.json
{ "servers": [{ "name": "git", "command": "git-mcp-v1", ... }] }

// プロジェクト設定: ./project/.adev/mcp/git/mcp.json
{ "servers": [{ "name": "git", "command": "git-mcp-v2", ... }] }

// マージ結果: プロジェクト設定がグローバル設定を上書き
await manager.initialize(globalDir, projectDir);
// → "git" サーバーは "git-mcp-v2" コマンド使用
```

### 4. 無効化されたサーバーは開始不可

```typescript
// mcp.json
{ "servers": [{ "name": "disabled-server", "enabled": false, ... }] }

await manager.initialize(globalDir);
const result = manager.startServer('disabled-server');

// result.ok === false
// result.error.code === 'mcp_server_disabled'
```

### 5. listTools()はrunningサーバーのみ含む

```typescript
manager.startServer('git');   // running
manager.startServer('slack'); // running
manager.stopServer('slack');  // stopped

const tools = manager.listTools();
// gitサーバーのツールのみ含まれる (slackサーバーのツールは除外)
```

---

## 💡 例コード

### 例 1: 基本サーバー管理

```typescript
import { ConsoleLogger } from './core/logger.js';
import { McpRegistry } from './mcp/registry.js';
import { McpLoader } from './mcp/loader.js';
import { McpManager } from './mcp/mcp-manager.js';

const logger = new ConsoleLogger('info');
const registry = new McpRegistry(logger);
const loader = new McpLoader(logger);
const manager = new McpManager(registry, loader, logger);

// 初期化
const initResult = await manager.initialize('~/.adev/mcp');
if (!initResult.ok) {
  throw initResult.error;
}

// gitサーバー開始
const gitResult = manager.startServer('git');
if (gitResult.ok) {
  console.log(`✅ gitサーバー開始: ${gitResult.value.config.command}`);
  console.log(`   開始時間: ${gitResult.value.startedAt.toISOString()}`);
}

// githubサーバー開始
const githubResult = manager.startServer('github');
if (githubResult.ok) {
  console.log(`✅ githubサーバー開始: ${githubResult.value.config.command}`);
}

// 使用可能なツール確認
const tools = manager.listTools();
console.log(`\n使用可能なツール: ${tools.length}個`);
for (const tool of tools) {
  console.log(`  - ${tool.name}: ${tool.description || '説明なし'}`);
}

// プロセス終了前整理
manager.stopAll();
console.log('\n✅ すべてのサーバー停止完了');
```

### 例 2: 状態モニタリング

```typescript
// すべてのサーバー状態確認
const healthResult = manager.healthCheck();

if (healthResult.ok) {
  console.log('📊 サーバー状態:');
  for (const [name, status] of Object.entries(healthResult.value)) {
    const emoji = status === 'running' ? '🟢' : '⚫';
    console.log(`  ${emoji} ${name}: ${status}`);
  }
}

// 個別サーバー状態確認
const gitStatus = manager.getStatus('git');
console.log(`\ngitサーバー: ${gitStatus}`);
```

### 例 3: エラー処理

```typescript
// 存在しないサーバー開始試行
const result1 = manager.startServer('nonexistent');
if (!result1.ok) {
  console.error(`❌ ${result1.error.code}: ${result1.error.message}`);
  // 出力: ❌ mcp_server_not_found: サーバーが見つかりません
}

// 無効化されたサーバー開始試行
const result2 = manager.startServer('disabled-server');
if (!result2.ok) {
  console.error(`❌ ${result2.error.code}: ${result2.error.message}`);
  // 出力: ❌ mcp_server_disabled: 無効化されたサーバーです
}

// すでに実行中のサーバー開始試行
manager.startServer('git');
const result3 = manager.startServer('git');
if (!result3.ok) {
  console.error(`❌ ${result3.error.code}: ${result3.error.message}`);
  // 出力: ❌ mcp_server_already_running: すでに実行中のサーバーです
}
```

---

## 🐛 エラー処理

### エラータイプ別対応

#### 1. 初期化失敗 (`initialize`)

**原因**:
- 設定ディレクトリがない
- mcp.jsonファイル形式エラー
- ファイル読み取り権限不足

**対応コード**:
```typescript
const initResult = await manager.initialize(globalDir, projectDir);

if (!initResult.ok) {
  logger.error('初期化失敗', {
    code: initResult.error.code,
    message: initResult.error.message,
  });

  // ディレクトリ生成試行
  if (initResult.error.message.includes('ENOENT')) {
    await mkdir(globalDir, { recursive: true });
    await manager.initialize(globalDir);  // 再試行
  }
}
```

#### 2. サーバー開始失敗 (`startServer`)

**エラーコード**:
- `mcp_server_not_found`: レジストリに登録されていないサーバー
- `mcp_server_disabled`: `enabled: false` サーバー
- `mcp_server_already_running`: すでにrunning状態

**対応コード**:
```typescript
const startResult = manager.startServer(serverName);

if (!startResult.ok) {
  switch (startResult.error.code) {
    case 'mcp_server_not_found':
      logger.warn('サーバー未登録 — 設定ファイル確認必要', { serverName });
      break;

    case 'mcp_server_disabled':
      logger.info('無効化されたサーバー — enabled: trueに変更必要', { serverName });
      break;

    case 'mcp_server_already_running':
      logger.debug('すでに実行中 — 無視', { serverName });
      break;

    default:
      logger.error('不明なエラー', { error: startResult.error });
  }
}
```

#### 3. サーバー停止失敗 (`stopServer`)

**エラーコード**:
- `mcp_server_not_found`: 実行されたことがないサーバー
- `mcp_server_already_stopped`: すでにstopped状態

**対応コード**:
```typescript
const stopResult = manager.stopServer(serverName);

if (!stopResult.ok) {
  switch (stopResult.error.code) {
    case 'mcp_server_not_found':
      logger.warn('実行されたことがないサーバー — 停止不可', { serverName });
      break;

    case 'mcp_server_already_stopped':
      logger.debug('すでに停止 — 無視', { serverName });
      break;

    default:
      logger.error('停止失敗', { error: stopResult.error });
  }
}
```

### 共通エラー処理パターン

```typescript
async function safeStartServer(
  manager: McpManager,
  name: string,
): Promise<boolean> {
  const result = manager.startServer(name);

  if (!result.ok) {
    logger.error('サーバー開始失敗', {
      name,
      code: result.error.code,
      message: result.error.message,
    });
    return false;
  }

  logger.info('サーバー開始成功', {
    name,
    status: result.value.status,
    startedAt: result.value.startedAt,
  });
  return true;
}

// 使用例
if (await safeStartServer(manager, 'git')) {
  console.log('gitサーバー使用準備完了');
}
```

---

## 🎓 高度な使用法

### 高度 1: サーバー自動開始

設定で `enabled: true` のサーバーを自動的に開始します。

```typescript
async function startAllEnabledServers(manager: McpManager): Promise<void> {
  // 初期化後healthCheckですべてのサーバーリスト取得
  const healthResult = manager.healthCheck();
  if (!healthResult.ok) {
    throw healthResult.error;
  }

  const serverNames = Object.keys(healthResult.value);

  for (const name of serverNames) {
    const result = manager.startServer(name);

    if (result.ok) {
      logger.info(`✅ ${name} サーバー開始成功`);
    } else if (result.error.code === 'mcp_server_disabled') {
      logger.debug(`⏭️  ${name} サーバースキップ (無効化))`);
    } else {
      logger.error(`❌ ${name} サーバー開始失敗`, { error: result.error.message });
    }
  }
}

await manager.initialize(globalDir);
await startAllEnabledServers(manager);
```

### 高度 2: サーバー状態リアルタイムモニタリング

定期的にサーバー状態を確認してログを残します。

```typescript
function monitorServerHealth(
  manager: McpManager,
  intervalMs = 30000,  // 30秒
): NodeJS.Timeout {
  return setInterval(() => {
    const healthResult = manager.healthCheck();

    if (healthResult.ok) {
      const runningCount = Object.values(healthResult.value).filter(
        (status) => status === 'running',
      ).length;

      logger.info('📊 サーバー状態チェック', {
        totalServers: Object.keys(healthResult.value).length,
        runningServers: runningCount,
        timestamp: new Date().toISOString(),
      });
    }
  }, intervalMs);
}

// 使用例
const monitorInterval = monitorServerHealth(manager);

// プロセス終了時モニタリング停止
process.on('SIGINT', () => {
  clearInterval(monitorInterval);
  manager.stopAll();
  process.exit(0);
});
```

### 高度 3: サーバー再起動ユーティリティ

サーバーを停止して再開始します（設定再読み込み時に有用）。

```typescript
function restartServer(
  manager: McpManager,
  name: string,
): Result<McpServerInstance> {
  // Step 1: 実行中なら停止
  const currentStatus = manager.getStatus(name);
  if (currentStatus === 'running') {
    const stopResult = manager.stopServer(name);
    if (!stopResult.ok) {
      return err(stopResult.error);
    }
    logger.info(`${name} サーバー停止完了`);
  }

  // Step 2: 再開始
  const startResult = manager.startServer(name);
  if (!startResult.ok) {
    return err(startResult.error);
  }

  logger.info(`${name} サーバー再起動完了`);
  return startResult;
}

// 使用例
const restartResult = restartServer(manager, 'git');
if (restartResult.ok) {
  console.log('✅ gitサーバー再起動成功');
}
```

### 高度 4: ツールフィルタリング

特定のパターンでツールをフィルタリングします。

```typescript
function filterToolsByPattern(
  manager: McpManager,
  pattern: string,
): McpTool[] {
  const allTools = manager.listTools();
  const regex = new RegExp(pattern, 'i');

  return allTools.filter((tool) => regex.test(tool.name));
}

// 使用例
const gitTools = filterToolsByPattern(manager, '^git_');
console.log('git関連ツール:', gitTools.map((t) => t.name));
// 出力: ['git_status', 'git_diff', 'git_commit', ...]

const createTools = filterToolsByPattern(manager, '_create$');
console.log('生成ツール:', createTools.map((t) => t.name));
// 出力: ['github_create_issue', 'slack_create_channel', ...]
```

### 高度 5: サーバーグループ管理

複数のサーバーをグループにまとめて一括管理します。

```typescript
class ServerGroup {
  constructor(
    private manager: McpManager,
    private serverNames: string[],
  ) {}

  startAll(): Result<void> {
    for (const name of this.serverNames) {
      const result = this.manager.startServer(name);
      if (!result.ok && result.error.code !== 'mcp_server_already_running') {
        return err(result.error);
      }
    }
    return ok(undefined);
  }

  stopAll(): Result<void> {
    for (const name of this.serverNames) {
      const result = this.manager.stopServer(name);
      if (!result.ok && result.error.code !== 'mcp_server_already_stopped') {
        return err(result.error);
      }
    }
    return ok(undefined);
  }

  getStatuses(): Record<string, McpServerStatus> {
    const statuses: Record<string, McpServerStatus> = {};
    for (const name of this.serverNames) {
      statuses[name] = this.manager.getStatus(name);
    }
    return statuses;
  }
}

// 使用例
const vcsGroup = new ServerGroup(manager, ['git', 'github']);
const communicationGroup = new ServerGroup(manager, ['slack', 'email']);

vcsGroup.startAll();
console.log('VCSグループ状態:', vcsGroup.getStatuses());
// 出力: { git: 'running', github: 'running' }

communicationGroup.startAll();
console.log('Communicationグループ状態:', communicationGroup.getStatuses());
// 出力: { slack: 'running', email: 'running' }

// 終了時グループ別整理
vcsGroup.stopAll();
communicationGroup.stopAll();
```

---

## ✅ チェックリスト

### 実装前チェックリスト

- [ ] McpRegistry実装完了
- [ ] McpLoader実装完了
- [ ] Loggerインスタンス準備完了
- [ ] 設定ファイルディレクトリ構造理解 (`~/.adev/mcp/`, `./project/.adev/mcp/`)
- [ ] mcp.jsonファイル形式理解

### 初期化チェックリスト

- [ ] globalDirパス正しい確認
- [ ] projectDirパス正しい確認 (オプション)
- [ ] initialize()呼び出し完了
- [ ] 初期化成功可否確認 (Resultパターン)
- [ ] 登録されたサーバーリスト確認 (healthCheck)

### サーバー管理チェックリスト

- [ ] startServer()呼び出し前にサーバーがレジストリに登録されているか確認
- [ ] startServer()結果をResultパターンでエラー処理
- [ ] 無効化されたサーバーは開始不可認知
- [ ] すでに実行中のサーバー再起動防止
- [ ] stopServer()呼び出し前にサーバーがrunning状態か確認

### ツール照会チェックリスト

- [ ] listTools()はrunningサーバーのツールのみ返却認知
- [ ] 停止したサーバーのツールはリストから除外認知
- [ ] ツールリストが空の可能性認知

### 整理チェックリスト

- [ ] プロセス終了前stopAll()呼び出し
- [ ] SIGINT、SIGTERMハンドラ登録
- [ ] すべてのサーバーがstopped状態か確認

---

## 📚 参考ドキュメント

- **ARCHITECTURE.md**: MCPモジュール位置、依存性グラフ
- **SPEC.md**: MCP統合要求事項、サーバー設定形式
- **IMPLEMENTATION-GUIDE.md**: MCP builtinサーバー統合ガイド
- **src/mcp/types.ts**: McpServerConfig, McpServerInstanceタイプ定義
- **src/mcp/registry.ts**: McpRegistry実装
- **src/mcp/loader.ts**: McpLoader実装
- **tests/unit/mcp/mcp-manager.test.ts**: テストケース

---

## 🎉 まとめ

McpManagerは **MCPサーバーのライフサイクル（初期化、開始、停止、状態確認）を管理** する中央制御システムです。

### 核心機能

1. **初期化 (initialize)**: 設定ファイル読み込み + サーバー登録
2. **開始 (startServer)**: サーバー状態をrunningに転換
3. **停止 (stopServer)**: サーバー状態をstoppedに転換
4. **全停止 (stopAll)**: すべてのサーバーを一度に停止
5. **状態照会 (getStatus)**: 個別サーバー状態確認
6. **ヘルスチェック (healthCheck)**: すべてのサーバー状態照会
7. **ツールリスト (listTools)**: 実行中のサーバーのツール集計

### 使用フロー

```
1. McpRegistry + McpLoader + Logger準備
2. McpManagerインスタンス生成
3. initialize(globalDir, projectDir)呼び出し
4. startServer(name)呼び出し
5. listTools()で使用可能なツール確認
6. stopAll()またはstopServer(name)呼び出し
```

### 核心利点

- ✅ Resultパターン基盤エラー処理
- ✅ 状態のみ管理 (プロセス生成はLayer2)
- ✅ グローバル + プロジェクト設定マージ
- ✅ 実行中のサーバーのツールのみ自動集計

**140テスト全て合格**で検証された安定性を保証します!
