> **Languages:** [한국어](../ko/integration-tester.md) | [English](../en/integration-tester.md) | [日本語](../ja/integration-tester.md) | [Español](../es/integration-tester.md)

# IntegrationTester — 統合テスト実行機

## 🎯 これは何ですか?

**小学生向けの例え:**
IntegrationTesterは「階段登りゲーム」です!

4階建ての建物を登ります:
- **1階 (Unit)**: 機能別テスト → 合格したら2階へ!
- **2階 (Module)**: 関連機能テスト → 合格したら3階へ!
- **3階 (Integration)**: 全体機能簡易テスト → 合格したら4階へ!
- **4階 (E2E)**: 全体システム完全テスト → 合格したら成功! 🎉

**重要なルール:** 1階でも失敗したらゲームオーバー! 最初からやり直しです。

これを「**Fail-Fast**」と言います。早く失敗して早く直すことです!

**技術説明:**
4段階統合テストをFail-Fast原則で実行するテスターです。
- Step 1: Unit Tests (機能別E2E)
- Step 2: Module Tests (関連機能回帰)
- Step 3: Integration Tests (非関連機能スモーク)
- Step 4: E2E Tests (全体統合)
- ProcessExecutorで`bun test`実行
- CleanEnvManagerでテスト分離
- 1個失敗時は即座に中断

---

## 🔍 なぜ必要ですか?

### 1. Fail-Fast原則
**問題:** 全テストを実行してから失敗を発見すると時間の無駄!

**解決:** 最初の失敗で即座に中断 → すぐ修正 → 最初からやり直し
```
❌ 悪い方法: 10分実行後「1階で失敗しました」→ 10分無駄
✅ 良い方法: 30秒で「1階失敗!」→ すぐ修正 → 2分で解決
```

### 2. テスト分離 (Clean Environment)
各テストごとにきれいな環境で実行:
```typescript
// テスト1: きれいな環境
await tester.runIntegrationTests('project-a', '/path/a');

// テスト2: また別のきれいな環境 (1の影響0%)
await tester.runIntegrationTests('project-b', '/path/b');
```

### 3. 4段階階段式検証
なぜ4段階に分けるの?
```
1階 (Unit): 個別機能が動作するか確認
   ↓
2階 (Module): 関連する機能同士がうまく動作するか確認
   ↓
3階 (Integration): 全体機能が簡単に動作するか確認
   ↓
4階 (E2E): 実際のユーザーのように完璧に動作するか確認
```

段階を分けると:
- どこで問題が発生したかすぐわかる
- 速いテスト → 遅いテスト順で効率的
- 問題を小さな単位で見つけられる

---

## 📐 アーキテクチャ

### Fail-Fast フロー図 (階段登りゲーム)

```
┌─────────────────┐
│ テスト開始       │
└────────┬────────┘
         ↓
┌─────────────────┐
│ 1階: Unit Tests │
└────────┬────────┘
         ↓
     合格? ───YES──→ ┌─────────────────┐
       │            │ 2階: Module Tests│
       NO           └────────┬────────┘
       ↓                     ↓
   ❌ 即座に中断          合格? ───YES──→ ┌──────────────────────┐
   (Fail-Fast)            │            │ 3階: Integration Tests│
                          NO           └────────┬─────────────┘
                          ↓                     ↓
                      ❌ 即座に中断          合格? ───YES──→ ┌─────────────────┐
                                            │            │ 4階: E2E Tests   │
                                            NO           └────────┬────────┘
                                            ↓                     ↓
                                        ❌ 即座に中断          合格? ───YES──→ ✅ 全体成功!
                                                              │
                                                              NO
                                                              ↓
                                                          ❌ 即座に中断
```

### 内部メカニズム

```
┌────────────────────────────────────────────┐
│ IntegrationTester                          │
├────────────────────────────────────────────┤
│ runIntegrationTests()                      │
│   ↓                                        │
│ CleanEnvManager.create() → 分離環境生成    │
│   ↓                                        │
│ for each step (1~4):                       │
│   ↓                                        │
│   runStep() → ProcessExecutor              │
│   ↓                                        │
│   bun test {testPath}                      │
│   ↓                                        │
│   parseTestResult() → exitCode + stdout    │
│   ↓                                        │
│   passed? ───YES──→ 次のステップ           │
│       │                                    │
│       NO ────→ ❌ break (Fail-Fast)        │
│                                            │
│ CleanEnvManager.destroy() → 環境整理       │
└────────────────────────────────────────────┘
```

### 設計改善ポイント (Architect インサイト)

**元の設計:** Agent Spawnでtester エージェント実行
```typescript
// 複雑な方法
const testerAgent = await agentSpawner.spawn('tester', config);
await testerAgent.run();
```

**実際の実装:** ProcessExecutorで`bun test`直接実行
```typescript
// シンプルな方法
await processExecutor.execute('bun', ['test', 'tests/unit']);
```

**WHY 改善されたか?**
1. **統合テストは「コマンド実行」が全て** → ProcessExecutorが適切
2. **Agent Spawnは複雑** → オーバーヘッド
3. **よりシンプルな解決策** → より速く安定

**教訓:** 常に最もシンプルな解決策から考えよう!

---

## 🔧 依存性

### 直接依存性
- `ProcessExecutor` (`src/core/process-executor.ts`) — `bun test`実行
- `CleanEnvManager` (`src/layer2/clean-env-manager.ts`) — テスト分離
- `Logger` (`src/core/logger.ts`) — ログ
- `Result` (`src/core/types.ts`) — エラー処理

### 依存性グラフ
```
layer2/integration-tester
  ↓
┌─────────────┬─────────────────┬──────────────┐
│ ProcessExecutor │ CleanEnvManager │ core/logger  │
└─────────────┴─────────────────┴──────────────┘
        ↓
    core/types (Result パターン)
```

**ルール:** layer2はcore、layer1、ragにのみ依存可能

---

## 📦 使い方

### ステップ 1: インスタンス生成

```typescript
import { IntegrationTester } from '../layer2/integration-tester.js';
import { ProcessExecutor } from '../core/process-executor.js';
import { CleanEnvManager } from '../layer2/clean-env-manager.js';
import { Logger } from '../core/logger.js';

// 1. ロガー生成
const logger = new Logger({ level: 'info' });

// 2. ProcessExecutor生成
const processExecutor = new ProcessExecutor(logger);

// 3. CleanEnvManager生成
const envManager = new CleanEnvManager(logger, '/tmp/clean-envs');

// 4. IntegrationTester生成
const tester = new IntegrationTester(logger, processExecutor, envManager);
```

### ステップ 2: 統合テスト実行

```typescript
// プロジェクトパス設定
const projectId = 'my-awesome-project';
const projectPath = '/Users/you/projects/my-project';

// 統合テスト実行
const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  console.log('✅ 統合テスト結果:');
  results.forEach((stepResult) => {
    console.log(`Step ${stepResult.step}:`, stepResult.passed ? '✅ 合格' : '❌ 失敗');
    if (!stepResult.passed) {
      console.log(`   失敗数: ${stepResult.failCount}`);
    }
  });

  // 全ステップ合格?
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log('🎉 全ステップ合格!');
  } else {
    console.log('❌ 一部のステップ失敗。コードを修正してください。');
  }
} else {
  console.error('テスト実行エラー:', result.error.message);
}
```

### ステップ 3: リアルタイム進捗確認

```typescript
// 現在進行中のステップ確認
const currentStep = tester.getCurrentStep();
console.log('現在のステップ:', currentStep);

// 中間結果確認
const intermediateResults = tester.getResults();
console.log('これまでの結果:', intermediateResults);
```

### ステップ 4: Fail-Fast 動作確認

```typescript
// 1階で失敗したら2~4階は実行されない
const result = await tester.runIntegrationTests('project', '/path');

if (result.ok) {
  const results = result.value;

  console.log('実行されたステップ数:', results.length);
  // 1階失敗時 → 1個だけ実行される (Fail-Fast)
  // 全て合格時 → 4個全部実行される
}
```

### ステップ 5: テストディレクトリ構造

IntegrationTesterは次のパスでテストを探します:
```
/path/to/project/
├── tests/
│   ├── unit/          ← Step 1: 機能別テスト
│   ├── module/        ← Step 2: モジュール統合テスト
│   ├── integration/   ← Step 3: 全体統合テスト
│   └── e2e/           ← Step 4: End-to-Endテスト
```

各ディレクトリに`.test.ts`ファイルを作成してください:
```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'bun:test';

describe('Authentication', () => {
  it('ログイン成功', () => {
    // テストコード
    expect(result).toBe(true);
  });
});
```

---

## ⚠️ 注意点

### 1. テストタイムアウト
**デフォルトタイムアウト: 5分 (300秒)**

非常に時間がかかるE2Eテストがある場合はタイムアウトを考慮してください:
```typescript
// 現在は5分固定
// 必要ならIntegrationTester生成時にオプション追加可能
```

**回避方法:**
- テストを小さく分ける
- 並列実行を検討
- 不要な待機時間を削除

### 2. Fail-Fast 意味の理解
**Fail-Fastは「早く失敗」ではなく「失敗時に即座に中断」です:**

```typescript
// ❌ 間違った理解: 全テストを早く実行
// ✅ 正しい理解: 1個失敗時は残りを実行しない

const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  if (results.length < 4) {
    console.log('Fail-Fast発動! 一部のステップのみ実行');
    console.log('実行されたステップ:', results.length);
  }
}
```

### 3. Clean Environment 自動整理
テスト完了後に自動的に環境が整理されます:
```typescript
// テスト前: きれいな環境生成
// テスト中: 分離された環境使用
// テスト後: 自動的に環境削除 (成功/失敗無関係)
```

**注意:** テスト中に生成されたファイルは環境と一緒に削除されます!

### 4. exitCodeとfailCount同時チェック
テスト合格条件:
```typescript
const passed = exitCode === 0 && failCount === 0;
```

**WHY 両方チェック?**
- `exitCode === 0`: プロセスが正常終了
- `failCount === 0`: 実際に失敗したテストがない

どちらか一つでもfalseなら失敗判定!

---

## 💡 例コード

### 例 1: ステップ別結果分析

```typescript
/**
 * 各ステップごとに詳細結果出力
 */
async function analyzeStepByStep(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
) {
  const result = await tester.runIntegrationTests(projectId, projectPath);

  if (!result.ok) {
    console.error('テスト実行エラー:', result.error.message);
    return;
  }

  const results = result.value;

  console.log('=== 統合テスト詳細結果 ===\n');

  const stepNames = ['Unit', 'Module', 'Integration', 'E2E'];

  results.forEach((stepResult, idx) => {
    const name = stepNames[stepResult.step - 1];
    const icon = stepResult.passed ? '✅' : '❌';

    console.log(`${icon} Step ${stepResult.step}: ${name}`);
    console.log(`   状態: ${stepResult.passed ? '合格' : '失敗'}`);
    console.log(`   失敗数: ${stepResult.failCount}`);
    console.log('');
  });

  // Fail-Fast発動確認
  if (results.length < 4) {
    const failedStep = results.findIndex((r) => !r.passed) + 1;
    console.log(`⚠️ Fail-Fast発動! Step ${failedStep}で中断されました。`);
  } else if (results.every((r) => r.passed)) {
    console.log('🎉 全ステップ合格! デプロイ準備完了!');
  }
}
```

### 例 2: 自動再試行 (失敗時コード修正後再実行)

```typescript
/**
 * 失敗時にユーザーに修正機会を提供後に再試行
 */
async function runWithRetry(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
  maxRetries = 3,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n=== 試行 ${attempt}/${maxRetries} ===`);

    const result = await tester.runIntegrationTests(projectId, projectPath);

    if (!result.ok) {
      console.error('テスト実行エラー:', result.error.message);
      continue;
    }

    const results = result.value;
    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      console.log('✅ 全テスト合格!');
      return true;
    }

    // 失敗したステップを探す
    const failedStep = results.find((r) => !r.passed);
    if (failedStep) {
      console.log(`❌ Step ${failedStep.step} 失敗 (${failedStep.failCount}個)`);

      if (attempt < maxRetries) {
        console.log('\nコードを修正後に続けるにはEnterを押してください...');
        // 実際にはreadlineなどでユーザー入力待機
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  console.log('❌ 最大再試行回数超過');
  return false;
}
```

### 例 3: リアルタイム進捗表示

```typescript
/**
 * テスト進捗状況をリアルタイムで表示
 */
async function runWithProgress(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
) {
  const stepNames = ['Unit', 'Module', 'Integration', 'E2E'];

  console.log('統合テスト開始...\n');

  // 進捗状況表示用インターバル
  const progressInterval = setInterval(() => {
    const currentStep = tester.getCurrentStep();
    const results = tester.getResults();

    if (currentStep > 0) {
      const currentName = stepNames[currentStep - 1];
      console.log(`現在実行中: Step ${currentStep} (${currentName})...`);
    }

    results.forEach((result, idx) => {
      if (result.passed) {
        console.log(`✅ Step ${result.step} 完了`);
      }
    });
  }, 2000);

  const result = await tester.runIntegrationTests(projectId, projectPath);

  clearInterval(progressInterval);

  if (result.ok) {
    console.log('\nテスト完了!');
  }
}
```

---

## 🐛 エラー対処

### エラーコード種類

#### 1. ProcessExecutor エラー
**原因:** `bun test`コマンド実行失敗

**解決:**
```typescript
const result = await tester.runIntegrationTests(projectId, projectPath);

if (!result.ok && result.error.code === 'process_execution_error') {
  console.error('bun test実行失敗:');
  console.error('1. Bunがインストールされているか確認');
  console.error('2. プロジェクトパスが正しいか確認');
  console.error('3. tests/ ディレクトリが存在するか確認');

  // パス確認
  console.log('プロジェクトパス:', projectPath);
}
```

#### 2. CleanEnvManager エラー
**原因:** 分離環境生成/削除失敗

**解決:**
```typescript
if (!result.ok && result.error.code === 'env_creation_failed') {
  console.error('クリーン環境生成失敗:');
  console.error('1. /tmp ディレクトリ書き込み権限確認');
  console.error('2. ディスク容量確認');
  console.error('3. 以前の環境整理 (rm -rf /tmp/clean-envs)');
}
```

#### 3. Test Timeout
**原因:** テストが5分以内に完了しない

**解決:**
```typescript
// 現在は5分固定なので、テストを最適化する必要がある
console.error('テストタイムアウト:');
console.error('1. 遅いテスト識別 (bun test --bail)');
console.error('2. 並列実行検討');
console.error('3. 不要な待機時間削除');
```

### ステップ別失敗処理

```typescript
const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  // 各ステップごとに失敗原因分析
  results.forEach((stepResult) => {
    if (!stepResult.passed) {
      console.error(`\n❌ Step ${stepResult.step} 失敗分析:`);

      switch (stepResult.step) {
        case 1:
          console.error('Unit Tests失敗:');
          console.error('→ 個別関数やクラスに問題があります。');
          console.error('→ tests/unit/ ディレクトリのテストを確認してください。');
          break;

        case 2:
          console.error('Module Tests失敗:');
          console.error('→ モジュール間統合に問題があります。');
          console.error('→ tests/module/ ディレクトリのテストを確認してください。');
          break;

        case 3:
          console.error('Integration Tests失敗:');
          console.error('→ 全体システム統合に問題があります。');
          console.error('→ tests/integration/ ディレクトリのテストを確認してください。');
          break;

        case 4:
          console.error('E2E Tests失敗:');
          console.error('→ 実際のユーザーシナリオに問題があります。');
          console.error('→ tests/e2e/ ディレクトリのテストを確認してください。');
          break;
      }

      console.error(`失敗したテスト数: ${stepResult.failCount}`);
    }
  });
}
```

---

## 📊 APIリファレンス

### `IntegrationTester` クラス

#### コンストラクタ
```typescript
constructor(
  logger: Logger,
  processExecutor: ProcessExecutor,
  envManager: CleanEnvManager,
)
```

**パラメータ:**
- `logger`: Loggerインスタンス
- `processExecutor`: ProcessExecutorインスタンス (`bun test`実行用)
- `envManager`: CleanEnvManagerインスタンス (テスト分離用)

---

#### `runIntegrationTests()` メソッド
```typescript
async runIntegrationTests(
  projectId: string,
  projectPath: string,
): Promise<Result<readonly IntegrationStepResult[]>>
```

**パラメータ:**
- `projectId`: プロジェクト固有ID
- `projectPath`: プロジェクト絶対パス

**戻り値:**
- 成功時: `IntegrationStepResult[]` (各ステップ結果)
- 失敗時: `AgentError`

**動作:**
1. CleanEnvManagerで分離環境生成
2. 4段階順次実行 (Fail-Fast)
3. 環境自動整理 (成功/失敗無関係)

---

#### `getCurrentStep()` メソッド
```typescript
getCurrentStep(): number
```

**戻り値:** 現在進行中のステップ (0なら未開始)

---

#### `getResults()` メソッド
```typescript
getResults(): IntegrationStepResult[]
```

**戻り値:** これまで実行されたステップの結果配列

---

### `IntegrationStepResult` インターフェース

```typescript
interface IntegrationStepResult {
  step: 1 | 2 | 3 | 4;  // ステップ番号
  passed: boolean;      // 合格可否
  failCount: number;    // 失敗したテスト数
}
```

---

## 🧪 テスト作成ガイド

### テストディレクトリ構造

```
tests/
├── unit/              ← Step 1: 個別機能テスト
│   ├── auth.test.ts
│   ├── config.test.ts
│   └── logger.test.ts
│
├── module/            ← Step 2: モジュール統合テスト
│   ├── auth-module.test.ts
│   └── rag-module.test.ts
│
├── integration/       ← Step 3: 全体統合スモークテスト
│   └── system.test.ts
│
└── e2e/               ← Step 4: End-to-Endユーザーシナリオ
    ├── login-flow.test.ts
    └── complete-task.test.ts
```

### テスト作成例

#### Step 1: Unit Test
```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'bun:test';
import { authenticate } from '../../src/auth/api-key-auth.js';

describe('Authentication', () => {
  it('正しいAPI keyで認証成功', async () => {
    const result = await authenticate('valid-key');
    expect(result.ok).toBe(true);
  });

  it('間違ったAPI keyで認証失敗', async () => {
    const result = await authenticate('invalid-key');
    expect(result.ok).toBe(false);
  });
});
```

#### Step 2: Module Test
```typescript
// tests/module/auth-module.test.ts
import { describe, it, expect } from 'bun:test';
import { AuthManager } from '../../src/auth/auth-manager.js';

describe('Auth Module', () => {
  it('API key認証 → Rate limit追跡', async () => {
    const manager = new AuthManager();
    await manager.authenticate('valid-key');

    const rateLimit = manager.getRateLimitStatus();
    expect(rateLimit.remaining).toBeGreaterThan(0);
  });
});
```

#### Step 3: Integration Test
```typescript
// tests/integration/system.test.ts
import { describe, it, expect } from 'bun:test';

describe('System Integration', () => {
  it('全体システム初期化および基本動作', async () => {
    // 簡単なスモークテスト
    const system = await initializeSystem();
    expect(system.isReady()).toBe(true);
  });
});
```

#### Step 4: E2E Test
```typescript
// tests/e2e/complete-task.test.ts
import { describe, it, expect } from 'bun:test';

describe('Complete Task E2E', () => {
  it('ユーザーが作業全体を完了', async () => {
    // 1. ログイン
    const user = await login('test@example.com', 'password');
    expect(user).toBeDefined();

    // 2. プロジェクト作成
    const project = await createProject('My Project');
    expect(project.id).toBeDefined();

    // 3. 作業実行
    const result = await runTask(project.id, 'Build feature');
    expect(result.success).toBe(true);
  });
});
```

---

## 🎓 高度な使用法

### 1. 特定ステップのみ実行 (現在未サポート)

```typescript
// 現在は全体4段階のみ実行可能
// 今後の改善: 特定ステップから開始する機能追加可能

// 予想インターフェース:
// await tester.runFrom(3, projectId, projectPath); // Step 3から開始
```

### 2. 並列プロジェクトテスト

```typescript
// 複数のプロジェクトを並列テスト
const projects = [
  { id: 'project-a', path: '/path/a' },
  { id: 'project-b', path: '/path/b' },
  { id: 'project-c', path: '/path/c' },
];

const results = await Promise.all(
  projects.map(({ id, path }) =>
    tester.runIntegrationTests(id, path),
  ),
);

results.forEach((result, idx) => {
  const { id } = projects[idx]!;
  if (result.ok) {
    const allPassed = result.value.every((r) => r.passed);
    console.log(`${id}:`, allPassed ? '✅' : '❌');
  }
});
```

### 3. テスト結果LanceDB保存

```typescript
/**
 * 統合テスト結果をLanceDBに永久保存
 */
async function saveTestResultsToDb(
  tester: IntegrationTester,
  vectorStore: VectorStore,
  projectId: string,
  projectPath: string,
) {
  const result = await tester.runIntegrationTests(projectId, projectPath);

  if (result.ok) {
    const results = result.value;

    // LanceDBに保存
    await vectorStore.addDocument({
      id: `test-${projectId}-${Date.now()}`,
      content: JSON.stringify({
        projectId,
        timestamp: new Date().toISOString(),
        results,
        allPassed: results.every((r) => r.passed),
      }),
      metadata: { type: 'integration-test-result' },
    });

    console.log('テスト結果保存完了');
  }
}
```

---

## 🔗 関連モジュール

- **ProcessExecutor** (`src/core/process-executor.ts`) - `bun test`実行
- **CleanEnvManager** (`src/layer2/clean-env-manager.ts`) - テスト分離
- **Logger** (`src/core/logger.ts`) - ログ
- **Result パターン** (`src/core/types.ts`) - エラー処理
- **AgentError** (`src/core/errors.ts`) - エラータイプ

---

## ✅ チェックリスト

IntegrationTesterを使う前に:
- [ ] tests/ ディレクトリ構造が正しいですか? (unit, module, integration, e2e)
- [ ] 各ディレクトリに.test.tsファイルがありますか?
- [ ] Bunがインストールされていますか?
- [ ] ProcessExecutorとCleanEnvManagerを生成しましたか?
- [ ] プロジェクトパスが絶対パスですか?
- [ ] Fail-Fast原則を理解しましたか?
- [ ] テストタイムアウト(5分)が十分ですか?

---

**最終更新:** 2026-03-04
**作成者:** documenterエージェント
**Architectスコア:** 100/100
**参照コード:** src/layer2/integration-tester.ts (252行)
**設計改善:** Agent Spawn → ProcessExecutor (シンプルさが勝利!)
