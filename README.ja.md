# autonomous-dev-agent (adev)

> **Languages:** [English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [Español](README.es.md)

**Claude Code Skills + RAGによる自律開発エージェントシステム**

[![TypeScript](https://img.shields.io/badge/TypeScript-ESNext-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.1-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)
[![Claude SDK](https://img.shields.io/badge/Claude_Agent_SDK-V2_Session_API-cc785c?logo=anthropic&logoColor=white)](https://docs.anthropic.com/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Embedded_Vector_DB-4B8BBE)](https://lancedb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 1. プロジェクト概要

**adev (autonomous-dev-agent)** は、Claudeの高度な機能とRAG(検索拡張生成)を組み合わせ、一貫した高品質な自律ソフトウェア開発を提供するインテリジェントエージェントオーケストレーションシステムです。

Claude Agent SDKを基盤とした3層アーキテクチャで構築され、要件収集からプロダクション対応コードまで、開発ライフサイクル全体を7つの専門エージェントが協調フェーズで管理します。

### 主な機能

- **3層アーキテクチャ**: ユーザー対話(Layer1)、自律開発(Layer2)、成果物生成(Layer3)の明確な分離
- **7つの専門エージェント**: architect、qa、coder、tester、qc、reviewer、documenterが協調フェーズで作業
- **4フェーズステートマシン**: DESIGN → CODE → TEST → VERIFYワークフローとFSMベースの遷移
- **4層検証**: qa/qc → reviewer → Layer1(意図検証) → adev(最終判定)
- **Fail-Fastテスティング**: 最初の失敗で即座に停止 → 修正 → そのステップから再実行
- **RAG強化メモリ**: LanceDBベクトルデータベースによる永続的コンテキスト、設計決定、失敗履歴管理
- **4-Provider埋め込み階層**: 無料(Xenova/Jina) + 有料(Voyage)自動選択
- **内蔵MCPサーバー**: filesystem、lancedb、memory、web-searchとカスタムMCPサポート
- **多言語ドキュメント**: 英語、韓国語、日本語、スペイン語の自動生成

---

## 2. アーキテクチャ概要

### 3層構造

```
┌───────────────────────────────────────────────┐
│ Layer 1: Claude API (Opus 4.6)               │
│ ユーザー対話、計画、設計、検証                  │
│ モジュール: src/layer1/                        │
├───────────────────────────────────────────────┤
│         ユーザー「確認」→ Contract → Layer2   │
├───────────────────────────────────────────────┤
│ Layer 2: Claude Agent SDK (V2 Session API)   │
│ ┌─────────────────────────────────────────┐   │
│ │ Layer2-A: 機能開発                      │   │
│ │   adev (チームリーダー)                  │   │
│ │   ├─ architect  — 設計とアーキテクチャ  │   │
│ │   ├─ qa         — 予防ゲート            │   │
│ │   ├─ coder ×N   — コード実装            │   │
│ │   ├─ tester     — テスト + Fail-fast   │   │
│ │   ├─ qc         — 検出 & 根本原因分析   │   │
│ │   ├─ reviewer   — コードレビュー        │   │
│ │   └─ documenter — ドキュメント作成      │   │
│ ├─────────────────────────────────────────┤   │
│ │ Layer2-B: 統合検証                       │   │
│ │   カスケードFail-Fast E2Eテスティング   │   │
│ ├─────────────────────────────────────────┤   │
│ │ Layer2-C: ユーザー確認                   │   │
│ └─────────────────────────────────────────┘   │
├───────────────────────────────────────────────┤
│ Layer 3: 成果物 + 継続的検証                  │
│ 統合ドキュメント、ビジネス成果物、E2E          │
│ モジュール: src/layer3/                        │
└───────────────────────────────────────────────┘
```

### モジュール依存関係グラフ

```
┌─────┐
│ cli │ ─────→ core, auth, layer1
└──┬──┘
   ↓
┌────────┐
│ layer1 │ ─→ core, rag
└────┬───┘
     ↓
┌────────┐
│ layer2 │ ─→ core, rag, layer1
└────┬───┘
     ↓
┌────────┐
│ layer3 │ ─→ core, rag, layer2
└────────┘

┌─────┐     ┌──────┐     ┌─────┐
│ rag │ ─→  │ core │  ←─ │ mcp │
└─────┘     └──────┘     └─────┘
            ↑
┌──────┐    │
│ auth │ ───┘
└──────┘
```

**ルール**: 依存関係は矢印方向にのみ流れます。循環依存は禁止。`core`モジュールは他のモジュールをインポートしません。

### 主要モジュール

| モジュール | ファイル数 | 主な責務 |
|--------|-------|---------------------|
| `core/` | 5 | config、errors、logger、memory、plugin-loader |
| `auth/` | 4 | APIキー / サブスクリプション認証 |
| `cli/` | 5 | CLIコマンド (init、start、config、project) |
| `layer1/` | 8 | ユーザー対話、計画、設計、契約作成 |
| `layer2/` | 16 | 自律開発オーケストレーション |
| `layer3/` | 5 | 統合ドキュメント、継続的E2E、ビジネス成果物 |
| `rag/` | 7 | LanceDB、埋め込み、コードインデックス、検索 |
| `mcp/` | 12 | MCPサーバー管理、4つの内蔵サーバー |

---

## 3. インストール

### 前提条件

- **Bunランタイム** (≥1.1.0) - 高速JavaScript/TypeScriptランタイム
- **Anthropic APIキー** または **Claude Pro/Maxサブスクリプション**

### Bunのインストール

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (WSL)
curl -fsSL https://bun.sh/install | bash

# インストール確認
bun --version
```

### クローンとセットアップ

```bash
# リポジトリクローン
git clone https://github.com/yourusername/autonomous-dev-agent.git
cd autonomous-dev-agent

# 依存関係インストール
bun install
```

### 認証

1つの認証方法のみを選択してください:

#### 方法1: APIキー

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

#### 方法2: サブスクリプション (Pro/Max)

```bash
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

> **注意**: 1つの環境変数のみを設定してください。両方を同時に設定しないでください。

---

## 4. 使用方法

### インタラクティブ開発セッション

インタラクティブ開発セッションを開始:

```bash
# 開発モード
bun run dev

# ビルドされたバイナリ (ビルド後)
./dist/index.js
```

インタラクティブモードでできること:
- プロジェクト要件とアイデアの議論
- 設計ドキュメントと契約書の生成
- 7つのエージェントによる自律開発のトリガー
- 各フェーズの出力のレビューと検証
- フィードバックに基づく反復的改善

### CLIコマンド

```bash
# プロジェクト + 認証の初期化
adev init

# Layer1対話の開始
adev start

# 設定の表示/変更
adev config

# 新しいプロジェクトの登録
adev project add <path>

# 登録されたプロジェクトのリスト
adev project list

# アクティブプロジェクトの切り替え
adev project switch <id>
```

### プロダクションビルド

```bash
# ビルド
bun run build

# ビルドされたバイナリの実行
./dist/index.js
```

---

## 5. テスト

### すべてのテストの実行

```bash
# 完全なテストスイート
bun test

# カバレッジレポート付き
bun test --coverage
```

### カテゴリ別テスト

```bash
# ユニットテストのみ
bun run test:unit

# モジュール統合テスト
bun run test:module

# エンドツーエンドテスト
bun run test:e2e
```

### Fail-Fastテスティング戦略

システムは**Fail-Fast**テスティング哲学に従います:

```
機能モード (Layer2-A):
  ユニット 10,000 → モジュール 10,000 → E2E 100,000+

統合モード (Layer2-B) — カスケード:
  ステップ1: 変更された機能 E2E 100,000+
  ステップ2: 関連機能 E2E 10,000 (リグレッション)
  ステップ3: 無関係な機能 E2E 1,000 (スモーク)
  ステップ4: 完全統合 E2E 1,000,000

比率: ランダム/エッジケース 80%+ · 正常ケース 最大20%
```

**原則**: 1つの失敗 → 即座に停止 → 修正 → そのステップから再開。失敗したテストで絶対に進行しません。

---

## 6. APIドキュメント

複数言語で提供される包括的なドキュメント:

- 📘 [English Documentation](docs/api/en/) - 完全なAPIリファレンス
- 📗 [한국어 문서](docs/api/ko/) - 完全なAPIリファレンス
- 📙 [日本語ドキュメント](docs/api/ja/) - 完全なAPIリファレンス
- 📕 [Documentación en Español](docs/api/es/) - 完全なAPIリファレンス

### 主要技術ドキュメント

| ドキュメント | 説明 |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 3層構造、モジュール依存関係、V2 Session APIパターン |
| [SPEC.md](SPEC.md) | 完全な技術仕様 v2.4 |
| [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md) | フェーズごとの実装ガイド |
| [AGENT-ROLES.md](docs/references/AGENT-ROLES.md) | 7つの専門エージェントの詳細 |
| [PHASE-ENGINE.md](docs/references/PHASE-ENGINE.md) | 4フェーズFSM遷移ルール |
| [EMBEDDING-STRATEGY.md](docs/references/EMBEDDING-STRATEGY.md) | 4-Provider階層埋め込み戦略 |
| [V2-SESSION-API.md](docs/references/V2-SESSION-API.md) | SDK V2 Session APIランタイムパターン |
| [CONTRACT-SCHEMA.md](docs/references/CONTRACT-SCHEMA.md) | 契約ベースHandoffPackageスキーマ |
| [TESTING-STRATEGY.md](docs/references/TESTING-STRATEGY.md) | Fail-Fast + カスケード統合検証 |

---

## 7. コントリビューション

コントリビューションを歓迎します! 以下のガイドラインに従ってください:

### コード規約

- **ES Modulesのみ**: CommonJS (`require`) 禁止
- **TypeScript Strictモード**: `any`型禁止、`unknown` + 型ガードを使用
- **Resultパターン**: エラー処理に`Result<T, E>`を使用、`throw`を最小化
- **命名規則**:
  - 変数/関数: `camelCase`
  - 型/クラス/インターフェース: `PascalCase`
  - 定数: `UPPER_SNAKE_CASE`
  - ファイル: `kebab-case.ts`
- **ファイルサイズ**: 300行超過時は分割
- **ロギング**: `src/core/logger.ts`を使用、`console.log`禁止
- **環境変数**: `src/core/config.ts`を使用、`process.env`直接アクセス禁止

### 開発ワークフロー

1. リポジトリをフォーク
2. 機能ブランチを作成: `feature/{機能名}`
3. コード規約に従って変更を作成
4. 品質チェックを実行: `bun run check`
5. Conventional Commitsでコミット:
   - `feat:` - 新機能
   - `fix:` - バグ修正
   - `docs:` - ドキュメント変更
   - `refactor:` - コードリファクタリング
   - `test:` - テスト変更
   - `chore:` - メンテナンスタスク
6. プッシュしてPull Requestを開く

### 品質ゲート (すべて合格必須)

- [ ] TypeScript型チェック: `bun run typecheck`
- [ ] Linting: `bun run lint`
- [ ] すべてのテスト合格: `bun run test`
- [ ] テストカバレッジ ≥80%
- [ ] 循環依存なし
- [ ] ドキュメント更新済み

### Pull Requestプロセス

1. すべてのテストが合格することを確認 (`bun test`)
2. 必要に応じてドキュメントを更新
3. PRテンプレートに従う
4. メンテナーにレビューを依頼
5. レビューフィードバックに対応
6. 承認後にマージ

### 問題報告

- バグと機能リクエストには問題テンプレートを使用
- バグの再現手順を含める
- 機能リクエストにはコンテキストを提供
- 既存の問題を最初に検索

---

## 8. ライセンス

このプロジェクトは**MITライセンス**の下でライセンスされています - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

---

## 追加リソース

### 技術スタック

| カテゴリ | 技術 | 目的 |
|----------|-----------|---------|
| **ランタイム** | [Bun](https://bun.sh/) ≥1.1 | パッケージマネージャー、バンドラー、テストランナー |
| **言語** | TypeScript (ESNext、strict) | 全コードベース |
| **Agent SDK** | [@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code) | V2 Session APIベースのエージェント実行 |
| **Vector DB** | [LanceDB](https://lancedb.com/) | 組み込み、サーバーレス、ファイルベースのベクトルDB |
| **Embedding** | [@huggingface/transformers](https://huggingface.co/docs/transformers.js) | ローカル埋め込み (Xenova/Jina) |
| **Linter** | [Biome](https://biomejs.dev/) | Linting + フォーマット |

### 4フェーズエンジン

エージェントは各フェーズを通過して機能を完成させます:

```
DESIGN ──(qaゲート + 合意)───→ CODE
CODE   ──(実装完了)───────────→ TEST
TEST   ──(0失敗 + qc)────────→ VERIFY
VERIFY ──(4層検証)───────────→ 完了
VERIFY ──(失敗)──────────────→ DESIGN/CODE/TESTに戻る
```

| フェーズ | 実行 | リードエージェント | 備考 |
|-------|-----------|------------|-------|
| **DESIGN** | エージェントチーム (議論) | architect | qaゲート必須 |
| **CODE** | query() ×N 並列 | coder ×N | モジュールごとのGitブランチ |
| **TEST** | query() 順次 | tester | Fail-Fast (最初の失敗で停止) |
| **VERIFY** | query() 順次 | adev | 4層検証 |

### 7つの専門エージェント

| エージェント | タイプ | 役割 | コード変更 |
|-------|------|------|-------------------|
| **architect** | Loop | 技術設計、アーキテクチャ決定 | ✗ |
| **qa** | Loop | 予防ゲート — コーディング前の仕様/設計検証 | ✗ |
| **coder** | Loop | コード実装 (書き込み権限を持つ唯一のエージェント) | ✓ |
| **tester** | Loop | テスト生成 + Fail-Fast実行 | テストのみ |
| **qc** | Loop | 検出 — 根本原因分析 (1つの原因を特定) | ✗ |
| **reviewer** | Loop | コードレビュー、規約/品質判定 | ✗ |
| **documenter** | Event | フェーズ完了時に生成 → ドキュメント生成 → 終了 | ✗ |

> **qa**は**予防** (コーディング前)、**qc**は**検出** (コーディング後)。役割が明確に分離されています。
> **coder**は×N並列実行可能、モジュールごとに`feature/{name}-{module}-coderN` Gitブランチで作業。

### LanceDBテーブル

| テーブル | 目的 |
|-------|---------|
| `memory` | 会話履歴、決定、フィードバック、エラー |
| `code_index` | コードベースチャンクベクトルインデックス |
| `design_decisions` | 設計決定履歴 |
| `failures` | 失敗履歴 + ソリューション |

### 4-Provider埋め込み階層

```
VOYAGE_API_KEY存在?
  ├─ YES → コード: voyage-code-3、テキスト: voyage-4-lite  (Tier 2、有料)
  └─ NO  → コード: jina-v3、       テキスト: xenova-minilm  (Tier 1、無料)
```

### 開発スクリプト

| コマンド | 説明 |
|---------|-------------|
| `bun run dev` | 開発モードで実行 |
| `bun run build` | プロダクションビルド |
| `bun run test` | すべてのテストを実行 |
| `bun run test:unit` | ユニットテストのみ |
| `bun run test:module` | モジュール統合テスト |
| `bun run test:e2e` | E2Eテスト |
| `bun run typecheck` | TypeScript型チェック |
| `bun run lint` | Biome linting |
| `bun run format` | Biome自動フォーマット |
| `bun run check` | typecheck + lint + test |

---

## ワークフロー例

```
ユーザー                      adev (Layer1)                  エージェント (Layer2)
 │                               │                               │
 │── "REST APIを作りたい" ────→ │                               │
 │                               │── アイデア + 質問 ──→         │
 │←── フィードバック/修正 ──     │                               │
 │                               │   (無限ループ)                │
 │── "確認" ──────────────→      │                               │
 │                               │── 契約書作成 ──→              │
 │←── 契約書レビュー ──          │                               │
 │── "承認" ────────────────→    │                               │
 │                               │── HandoffPackage ─────────→   │
 │                               │                               │── DESIGN (チーム議論)
 │                               │                               │── CODE (coder ×N 並列)
 │                               │                               │── TEST (Fail-Fast)
 │                               │                               │── VERIFY (4層検証)
 │                               │←── 検証結果 ──────────       │
 │←── 結果レポート ──            │                               │
 │                               │                               │
 │── "確認" ──────────────→      │── Layer3遷移 ──→              │
 │                               │   統合ドキュメント + 継続的E2E │
```

---

## サポート

- 📧 メール: support@adev.example.com
- 💬 Discord: [コミュニティに参加](https://discord.gg/adev)
- 🐛 問題: [GitHub Issues](https://github.com/yourusername/autonomous-dev-agent/issues)
- 📖 ドキュメント: [完全なドキュメント](https://docs.adev.example.com)

---

## 謝辞

- **Anthropic** - Claude APIとAgent SDK
- **LanceDB** - 組み込みベクトルデータベース
- **Bun** - 高速JavaScriptランタイム
- **コミュニティコントリビューター** - 貢献いただきありがとうございます!

---

**adevチームが心を込めて構築しました**
