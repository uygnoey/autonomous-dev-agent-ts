> **Languages:** [한국어](../ko/process-executor.md) | [English](../en/process-executor.md) | [日本語](../ja/process-executor.md) | [Español](../es/process-executor.md)

# ProcessExecutor — プロセス実行機

## 🎯 これは何ですか?

**小学生向けの例え:**
コンピュータに「他のプログラムを実行して!」とお願いするロボットです。

例えば:
- "git" プログラムを実行して → コードの状態を確認
- "bun test" を実行して → テストを実行
- "ls" を実行して → ファイル一覧を表示

ロボットはプログラムが終了するまで待ってから、結果を持ってきてくれます。

**技術説明:**
`Bun.spawn`をラップした外部プロセス実行ユーティリティです。
- stdout/stderr 自動キャプチャ
- タイムアウト管理
- エラー処理統合
- Result パターン返却

---

## 🔍 なぜ必要ですか?

### 1. 安全な実行
直接`Bun.spawn`を使うと:
- タイムアウト処理を毎回実装する必要がある
- 出力が大きすぎるとメモリが溢れる
- エラー処理が複雑

ProcessExecutorはこれを自動的に解決します。

### 2. 一貫したインターフェース
すべてのプロセス実行が同じ方法:
```typescript
const result = await executor.execute('コマンド', ['引数']);
if (result.ok) {
  console.log(result.value.stdout); // 結果出力
}
```

### 3. 可観測性
すべてのプロセス実行がLoggerを通じて記録されます。
- どのコマンドを実行したか
- どれくらいかかったか
- エラーは何だったか

---

## 📦 使い方

### ステップ 1: インスタンス生成

```typescript
import { ProcessExecutor } from '../core/process-executor.js';
import { Logger } from '../core/logger.js';

// ロガー生成
const logger = new Logger({ level: 'info' });

// ProcessExecutor 生成
const executor = new ProcessExecutor(logger);
```

### ステップ 2: 簡単なコマンド実行

```typescript
// 'ls -la' 実行
const result = await executor.execute('ls', ['-la']);

if (result.ok) {
  console.log('実行成功!');
  console.log('終了コード:', result.value.exitCode); // 0
  console.log('出力:', result.value.stdout);
  console.log('実行時間:', result.value.durationMs, 'ms');
} else {
  console.error('実行失敗:', result.error.message);
}
```

### ステップ 3: オプション付き実行

```typescript
// Git status 確認 (特定のディレクトリで)
const result = await executor.execute('git', ['status'], {
  cwd: '/path/to/project', // 作業ディレクトリ
  timeoutMs: 10000,         // 10秒タイムアウト
  env: {                     // 環境変数追加
    GIT_PAGER: 'cat',
  },
});

if (result.ok) {
  console.log(result.value.stdout);
}
```

### ステップ 4: stdin入力と共に実行

```typescript
// echo コマンドに入力を渡す
const result = await executor.execute('cat', [], {
  stdin: 'Hello, World!\n', // stdinで渡す
});

if (result.ok) {
  console.log(result.value.stdout); // "Hello, World!"
}
```

### ステップ 5: テスト実行例

```typescript
// Bun テスト実行
const result = await executor.execute('bun', ['test', 'tests/unit'], {
  cwd: '/project/path',
  timeoutMs: 300000, // 5分タイムアウト (テストは時間がかかる)
});

if (result.ok) {
  const { exitCode, stdout, stderr } = result.value;

  if (exitCode === 0) {
    console.log('✅ 全テスト合格!');
  } else {
    console.error('❌ テスト失敗:');
    console.error(stderr);
  }
}
```

---

## ⚠️ 注意点

### 1. タイムアウト設定
**デフォルトタイムアウト: 30秒**

時間がかかる作業は必ずタイムアウトを延ばしてください:
```typescript
// ❌ 間違った例: ビルドは30秒で終わらない可能性がある
await executor.execute('bun', ['build']);

// ✅ 正しい例: 十分なタイムアウト設定
await executor.execute('bun', ['build'], {
  timeoutMs: 120000, // 2分
});
```

### 2. 出力サイズ制限
**最大出力: 10MB**

大きなファイルを出力するコマンドは注意してください:
```typescript
// ❌ 危険: 100MBファイルを出力するとエラー
await executor.execute('cat', ['huge-file.log']);

// ✅ 安全: headで一部だけ出力
await executor.execute('head', ['-n', '100', 'huge-file.log']);
```

### 3. 作業ディレクトリ確認
cwdを指定しないと現在のディレクトリで実行されます:
```typescript
// プロジェクトディレクトリで実行したい場合は必ずcwdを指定
await executor.execute('git', ['status'], {
  cwd: projectPath, // 明示的に指定
});
```

### 4. Result パターンチェック
常に`.ok`確認後に`.value`にアクセス:
```typescript
// ❌ 危険: エラー時にundefinedアクセス
const result = await executor.execute('unknown-command', []);
console.log(result.value.stdout); // エラー発生!

// ✅ 安全: okチェック後にアクセス
if (result.ok) {
  console.log(result.value.stdout);
} else {
  console.error(result.error.message);
}
```

---

## 💡 例コード

### 例 1: Git コミット有無確認

```typescript
/**
 * Gitリポジトリにコミットされていない変更があるか確認
 */
async function hasUncommittedChanges(
  executor: ProcessExecutor,
  repoPath: string,
): Promise<boolean> {
  const result = await executor.execute('git', ['status', '--porcelain'], {
    cwd: repoPath,
  });

  if (!result.ok) {
    console.error('Git status 失敗:', result.error.message);
    return false;
  }

  // 出力が空でなければ → 変更あり
  return result.value.stdout.trim().length > 0;
}
```

### 例 2: タイムアウト再試行

```typescript
/**
 * タイムアウト発生時に再試行する関数
 */
async function executeWithRetry(
  executor: ProcessExecutor,
  command: string,
  args: string[],
  maxRetries = 3,
): Promise<Result<ProcessResult>> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await executor.execute(command, args, {
      timeoutMs: 30000,
    });

    if (result.ok) {
      return result; // 成功時はすぐに返す
    }

    // タイムアウトでないエラーは再試行しない
    if (result.error.code !== 'process_timeout') {
      return result;
    }

    console.log(`タイムアウト発生 (${attempt}/${maxRetries}), 再試行中...`);
  }

  return err(new AdevError('process_timeout', '最大再試行回数を超過'));
}
```

### 例 3: リアルタイム進捗表示 (簡易版)

```typescript
/**
 * 長い作業実行時に進行中であることを表示
 */
async function executeWithProgress(
  executor: ProcessExecutor,
  command: string,
  args: string[],
  description: string,
): Promise<Result<ProcessResult>> {
  console.log(`⏳ ${description} 開始...`);
  const startTime = Date.now();

  const result = await executor.execute(command, args, {
    timeoutMs: 120000, // 2分
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.ok) {
    console.log(`✅ ${description} 完了 (${duration}秒)`);
  } else {
    console.error(`❌ ${description} 失敗 (${duration}秒):`, result.error.message);
  }

  return result;
}

// 使用例:
await executeWithProgress(executor, 'bun', ['test'], 'テスト実行');
```

---

## 🐛 エラー対処

### エラーコード種類

ProcessExecutorは3種類のエラーを返します:

#### 1. `process_timeout`
**原因:** コマンドがタイムアウト時間内に完了しない

**解決:**
```typescript
// timeoutMsを増やしてください
const result = await executor.execute('slow-command', [], {
  timeoutMs: 120000, // 30秒 → 120秒に増加
});
```

#### 2. `process_output_too_large`
**原因:** stdoutまたはstderrが10MBを超える

**解決:**
```typescript
// 出力を減らすオプションを追加
const result = await executor.execute('cat', ['large-file.txt'], {
  // またはhead/tailで一部だけ出力
});

// 代替案: ファイルにリダイレクト
await executor.execute('sh', ['-c', 'cat large-file.txt > output.txt']);
```

#### 3. `process_execution_error`
**原因:** プロセス実行自体が失敗 (コマンドなし、権限なしなど)

**解決:**
```typescript
const result = await executor.execute('nonexistent-command', []);
if (!result.ok) {
  if (result.error.code === 'process_execution_error') {
    console.error('コマンドが見つからないか実行できません。');
    console.error('コマンドのスペルを確認するか、PATHにあるか確認してください。');
  }
}
```

### エラー処理パターン

```typescript
const result = await executor.execute('some-command', ['arg1', 'arg2']);

if (!result.ok) {
  const { code, message } = result.error;

  switch (code) {
    case 'process_timeout':
      console.error('⏱️ タイムアウト! コマンド実行時間が長すぎます。');
      console.error('→ timeoutMsオプションを増やしてください。');
      break;

    case 'process_output_too_large':
      console.error('📦 出力サイズ超過! 10MBを超えました。');
      console.error('→ 出力を減らすか、ファイルにリダイレクトしてください。');
      break;

    case 'process_execution_error':
      console.error('❌ 実行失敗:', message);
      console.error('→ コマンドが存在するか、権限があるか確認してください。');
      break;

    default:
      console.error('❓ 不明なエラー:', message);
  }

  return; // エラー処理後終了
}

// 成功ケース
console.log('✅ 実行成功:', result.value.stdout);
```

---

## 📊 APIリファレンス

### `ProcessExecutor` クラス

#### コンストラクタ
```typescript
constructor(logger: Logger)
```

**パラメータ:**
- `logger`: Loggerインスタンス (ログ用)

---

#### `execute()` メソッド
```typescript
async execute(
  command: string,
  args?: readonly string[],
  options?: ProcessOptions,
): Promise<Result<ProcessResult>>
```

**パラメータ:**
- `command`: 実行するコマンド (例: 'git', 'bun', 'ls')
- `args`: コマンド引数配列 (オプション、デフォルト: `[]`)
- `options`: 実行オプション (オプション)

**戻り値:**
- `Result<ProcessResult>`: 成功時は`.ok === true`、失敗時は`.error`を含む

---

### `ProcessOptions` インターフェース

```typescript
interface ProcessOptions {
  cwd?: string;              // 作業ディレクトリ
  env?: Record<string, string>; // 環境変数
  timeoutMs?: number;        // タイムアウト (デフォルト: 30000ms)
  stdin?: string;            // stdin入力
}
```

---

### `ProcessResult` インターフェース

```typescript
interface ProcessResult {
  exitCode: number;    // 終了コード (0 = 成功)
  stdout: string;      // 標準出力
  stderr: string;      // 標準エラー
  durationMs: number;  // 実行時間 (ミリ秒)
}
```

---

## 🎓 高度な使用法

### 1. 並列実行

複数のコマンドを同時に実行:
```typescript
const [result1, result2, result3] = await Promise.all([
  executor.execute('bun', ['test', 'tests/unit']),
  executor.execute('bun', ['test', 'tests/module']),
  executor.execute('bun', ['test', 'tests/integration']),
]);

// すべて成功したか確認
if (result1.ok && result2.ok && result3.ok) {
  console.log('✅ 全テスト合格!');
}
```

### 2. エラーコード確認

プログラムが0でないコードで終了してもResultはokの場合があります:
```typescript
const result = await executor.execute('grep', ['pattern', 'file.txt']);

if (result.ok) {
  // 実行は成功したがexitCodeで実際の結果を判断
  if (result.value.exitCode === 0) {
    console.log('パターンを見つけました!');
  } else if (result.value.exitCode === 1) {
    console.log('パターンが見つかりませんでした。');
  }
}
```

### 3. 環境変数オーバーライド

特定の環境変数だけ変更:
```typescript
const result = await executor.execute('node', ['script.js'], {
  env: {
    NODE_ENV: 'production',  // 追加/オーバーライド
    DEBUG: '*',              // デバッグ有効化
    // その他の環境変数は自動継承される
  },
});
```

---

## 🔗 関連モジュール

- **Logger** (`src/core/logger.ts`) - ログ担当
- **Result パターン** (`src/core/types.ts`) - エラー処理パターン
- **AdevError** (`src/core/errors.ts`) - エラータイプ

---

## ✅ チェックリスト

ProcessExecutorを使う前に:
- [ ] Loggerインスタンスを生成しましたか?
- [ ] コマンドのスペルは正しいですか?
- [ ] タイムアウトは十分長いですか?
- [ ] Resultパターンでエラー処理をしましたか?
- [ ] cwdを正しく設定しましたか?

---

**最終更新:** 2026-03-04
**作成者:** documenterエージェント
